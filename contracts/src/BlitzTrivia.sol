// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title BlitzTrivia — front-running-resistant live wagered trivia
/// @notice Answers are sealed with commit–reveal so nothing readable ever hits the
///         mempool or contract storage before the buzzer. Both phases are driven by
///         block deadlines, which is only playable at sub-second block times.
///
///         The commitment binds to msg.sender. Without that, anyone could copy a
///         pending commitment hash out of the mempool, submit it as their own, and
///         replay the victim's reveal — letting them win with someone else's thinking.
contract BlitzTrivia {
    // ---------------------------------------------------------------- constants

    uint256 public constant BASE_POINTS = 100;
    uint256 public constant SPEED_BONUS = 100;
    uint256 public constant RAKE_BPS = 500; // 5% house rake
    uint8 public constant NUM_CHOICES = 4;

    // ---------------------------------------------------------------- types

    enum Phase {
        IDLE, // question not started yet
        COMMIT, // sealed answers accepted
        REVEAL, // openings accepted
        SCORED // question closed
    }

    struct Quiz {
        address host;
        uint256 entryFee;
        uint32 commitBlocks;
        uint32 revealBlocks;
        uint8 questionCount;
        uint8 nextQuestion; // questions started so far
        bool finalized;
        bool rakeClaimed;
        uint256 pot;
        uint256 totalScore;
    }

    struct Commit {
        bytes32 commitment;
        uint32 points; // potential points, fixed at commit time by the commit block
        bool revealed;
        uint8 answer;
    }

    // ---------------------------------------------------------------- storage

    uint256 public nextQuizId;

    mapping(uint256 => Quiz) private _quizzes;
    mapping(uint256 => address[]) private _players;
    mapping(uint256 => mapping(address => bool)) public joined;
    mapping(uint256 => mapping(address => bool)) public claimed;

    /// host's sealed answers, committed up front at createQuiz
    mapping(uint256 => bytes32[]) private _hostCommitments;
    mapping(uint256 => mapping(uint8 => bool)) public hostRevealed;
    mapping(uint256 => mapping(uint8 => uint8)) public hostAnswer;

    mapping(uint256 => mapping(uint8 => uint64)) public startBlock;
    mapping(uint256 => mapping(uint8 => mapping(address => Commit))) private _commits;

    /// points revealed against each choice, so the host reveal can settle the
    /// question total in O(1) instead of looping over players
    mapping(uint256 => mapping(uint8 => mapping(uint8 => uint256))) private _bucket;

    // ---------------------------------------------------------------- events

    event QuizCreated(
        uint256 indexed quizId,
        address indexed host,
        uint256 entryFee,
        uint8 questionCount,
        uint32 commitBlocks,
        uint32 revealBlocks
    );
    event PlayerJoined(uint256 indexed quizId, address indexed player, uint256 playerCount);
    event QuestionStarted(
        uint256 indexed quizId,
        uint8 indexed q,
        uint64 startBlock,
        uint64 commitDeadline,
        uint64 revealDeadline
    );
    event AnswerCommitted(
        uint256 indexed quizId,
        uint8 indexed q,
        address indexed player,
        bytes32 commitment,
        uint64 commitBlock,
        uint32 points
    );
    event HostAnswerRevealed(uint256 indexed quizId, uint8 indexed q, uint8 answer);
    event AnswerRevealed(
        uint256 indexed quizId,
        uint8 indexed q,
        address indexed player,
        uint8 answer,
        uint32 points,
        bool correct
    );
    event Finalized(uint256 indexed quizId, uint256 totalScore, uint256 prizePool);
    event Claimed(uint256 indexed quizId, address indexed player, uint256 amount);

    // ---------------------------------------------------------------- errors

    error NotHost();
    error BadQuestion();
    error WrongPhase();
    error AlreadyJoined();
    error NotJoined();
    error QuizStarted();
    error WrongEntryFee();
    error AlreadyCommitted();
    error NoCommit();
    error AlreadyRevealed();
    error BadReveal();
    error NotFinalized();
    error AlreadyFinalized();
    error AlreadyClaimed();
    error BadParams();
    error TransferFailed();

    // ---------------------------------------------------------------- hashing

    /// @notice The one hash everything depends on. All five fields matter:
    ///         quizId + q stop replay across rounds, `who` stops commit copying.
    function commitmentHash(uint256 quizId, uint8 q, uint8 answer, bytes32 salt, address who)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(quizId, q, answer, salt, who));
    }

    // ---------------------------------------------------------------- lifecycle

    /// @param expectedQuizId id the host hashed its commitments against; reverts on a race
    function createQuiz(
        uint256 expectedQuizId,
        bytes32[] calldata answerCommitments,
        uint256 entryFee,
        uint32 commitBlocks,
        uint32 revealBlocks
    ) external returns (uint256 quizId) {
        if (answerCommitments.length == 0 || answerCommitments.length > 32) revert BadParams();
        if (commitBlocks == 0 || revealBlocks == 0) revert BadParams();

        quizId = nextQuizId++;
        if (quizId != expectedQuizId) revert BadParams();

        Quiz storage z = _quizzes[quizId];
        z.host = msg.sender;
        z.entryFee = entryFee;
        z.commitBlocks = commitBlocks;
        z.revealBlocks = revealBlocks;
        z.questionCount = uint8(answerCommitments.length);
        _hostCommitments[quizId] = answerCommitments;

        emit QuizCreated(
            quizId, msg.sender, entryFee, z.questionCount, commitBlocks, revealBlocks
        );
    }

    function join(uint256 quizId) external payable {
        Quiz storage z = _quizzes[quizId];
        if (z.host == address(0)) revert BadParams();
        if (z.nextQuestion != 0) revert QuizStarted();
        if (joined[quizId][msg.sender]) revert AlreadyJoined();
        if (msg.value != z.entryFee) revert WrongEntryFee();

        joined[quizId][msg.sender] = true;
        _players[quizId].push(msg.sender);
        z.pot += msg.value;

        emit PlayerJoined(quizId, msg.sender, _players[quizId].length);
    }

    /// @notice Host stamps the start block; every deadline in the UI derives from it.
    function startQuestion(uint256 quizId, uint8 q) external {
        Quiz storage z = _quizzes[quizId];
        if (msg.sender != z.host) revert NotHost();
        if (q != z.nextQuestion || q >= z.questionCount) revert BadQuestion();
        // a question never starts while the previous one is still open
        if (q > 0 && block.number < revealDeadline(quizId, q - 1)) revert WrongPhase();

        startBlock[quizId][q] = uint64(block.number);
        z.nextQuestion = q + 1;

        emit QuestionStarted(
            quizId, q, uint64(block.number), commitDeadline(quizId, q), revealDeadline(quizId, q)
        );
    }

    // ---------------------------------------------------------------- play

    function commitAnswer(uint256 quizId, uint8 q, bytes32 commitment) external {
        if (!joined[quizId][msg.sender]) revert NotJoined();
        if (phaseOf(quizId, q) != Phase.COMMIT) revert WrongPhase();

        Commit storage c = _commits[quizId][q][msg.sender];
        if (c.commitment != bytes32(0)) revert AlreadyCommitted();

        Quiz storage z = _quizzes[quizId];
        uint256 elapsed = block.number - startBlock[quizId][q];
        uint256 remaining = z.commitBlocks - _min(elapsed, z.commitBlocks);
        // points are locked in by the block you answered in, not the block you revealed in
        // safe: BASE_POINTS + SPEED_BONUS is 200, far inside uint32
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 points = uint32(BASE_POINTS + (SPEED_BONUS * remaining) / z.commitBlocks);

        c.commitment = commitment;
        c.points = points;

        emit AnswerCommitted(quizId, q, msg.sender, commitment, uint64(block.number), points);
    }

    /// @notice Host opens its own sealed answer. Committed before anyone played, so the
    ///         host cannot pick the answer after seeing what the room guessed.
    function revealHostAnswer(uint256 quizId, uint8 q, uint8 answer, bytes32 hostSalt) external {
        Quiz storage z = _quizzes[quizId];
        if (msg.sender != z.host) revert NotHost();
        if (phaseOf(quizId, q) != Phase.REVEAL) revert WrongPhase();
        if (hostRevealed[quizId][q]) revert AlreadyRevealed();
        if (commitmentHash(quizId, q, answer, hostSalt, z.host) != _hostCommitments[quizId][q]) {
            revert BadReveal();
        }

        hostRevealed[quizId][q] = true;
        hostAnswer[quizId][q] = answer;
        // everyone who already revealed this answer settles in one shot
        z.totalScore += _bucket[quizId][q][answer];

        emit HostAnswerRevealed(quizId, q, answer);
    }

    /// @notice Open your sealed answer. Order against the host reveal does not matter.
    function revealAnswer(uint256 quizId, uint8 q, uint8 answer, bytes32 salt) external {
        if (phaseOf(quizId, q) != Phase.REVEAL) revert WrongPhase();
        if (answer >= NUM_CHOICES) revert BadReveal();

        Commit storage c = _commits[quizId][q][msg.sender];
        if (c.commitment == bytes32(0)) revert NoCommit();
        if (c.revealed) revert AlreadyRevealed();
        if (commitmentHash(quizId, q, answer, salt, msg.sender) != c.commitment) revert BadReveal();

        c.revealed = true;
        c.answer = answer;
        _bucket[quizId][q][answer] += c.points;

        bool correct = hostRevealed[quizId][q] && hostAnswer[quizId][q] == answer;
        if (correct) _quizzes[quizId].totalScore += c.points;

        emit AnswerRevealed(quizId, q, msg.sender, answer, c.points, correct);
    }

    // ---------------------------------------------------------------- settlement

    function finalize(uint256 quizId) external {
        Quiz storage z = _quizzes[quizId];
        if (z.host == address(0)) revert BadParams();
        if (z.finalized) revert AlreadyFinalized();
        if (z.nextQuestion != z.questionCount) revert WrongPhase();
        if (block.number < revealDeadline(quizId, z.questionCount - 1)) revert WrongPhase();

        z.finalized = true;
        emit Finalized(quizId, z.totalScore, prizePool(quizId));
    }

    /// @notice Pull, never push. Paying every player in one transaction is an unbounded
    ///         loop and a gas hazard; this also puts more transactions on chain.
    function claim(uint256 quizId) external {
        Quiz storage z = _quizzes[quizId];
        if (!z.finalized) revert NotFinalized();
        if (!joined[quizId][msg.sender]) revert NotJoined();
        if (claimed[quizId][msg.sender]) revert AlreadyClaimed();

        uint256 amount = payoutOf(quizId, msg.sender);
        claimed[quizId][msg.sender] = true;
        if (amount > 0) _send(msg.sender, amount);

        emit Claimed(quizId, msg.sender, amount);
    }

    /// @notice House rake — the revenue line. Nothing to take if the round refunds.
    function claimRake(uint256 quizId) external {
        Quiz storage z = _quizzes[quizId];
        if (msg.sender != z.host) revert NotHost();
        if (!z.finalized) revert NotFinalized();
        if (z.rakeClaimed) revert AlreadyClaimed();
        if (z.totalScore == 0) revert BadParams(); // pot was refunded in full

        z.rakeClaimed = true;
        uint256 rake = z.pot - prizePool(quizId);
        if (rake > 0) _send(z.host, rake);
    }

    // ---------------------------------------------------------------- views

    function getQuiz(uint256 quizId) external view returns (Quiz memory) {
        return _quizzes[quizId];
    }

    function getPlayers(uint256 quizId) external view returns (address[] memory) {
        return _players[quizId];
    }

    function playerCount(uint256 quizId) public view returns (uint256) {
        return _players[quizId].length;
    }

    function getCommit(uint256 quizId, uint8 q, address player)
        external
        view
        returns (Commit memory)
    {
        return _commits[quizId][q][player];
    }

    function hostCommitments(uint256 quizId) external view returns (bytes32[] memory) {
        return _hostCommitments[quizId];
    }

    function commitDeadline(uint256 quizId, uint8 q) public view returns (uint64) {
        return startBlock[quizId][q] + _quizzes[quizId].commitBlocks;
    }

    function revealDeadline(uint256 quizId, uint8 q) public view returns (uint64) {
        return commitDeadline(quizId, q) + _quizzes[quizId].revealBlocks;
    }

    function phaseOf(uint256 quizId, uint8 q) public view returns (Phase) {
        uint64 s = startBlock[quizId][q];
        if (s == 0) return Phase.IDLE;
        if (block.number < commitDeadline(quizId, q)) return Phase.COMMIT;
        if (block.number < revealDeadline(quizId, q)) return Phase.REVEAL;
        return Phase.SCORED;
    }

    /// @notice Bounded by questionCount (<= 32), so this is safe to call on chain.
    function scoreOf(uint256 quizId, address player) public view returns (uint256 total) {
        uint8 n = _quizzes[quizId].questionCount;
        for (uint8 q = 0; q < n; q++) {
            Commit storage c = _commits[quizId][q][player];
            if (c.revealed && hostRevealed[quizId][q] && hostAnswer[quizId][q] == c.answer) {
                total += c.points;
            }
        }
    }

    function leaderboard(uint256 quizId)
        external
        view
        returns (address[] memory addrs, uint256[] memory scores)
    {
        addrs = _players[quizId];
        scores = new uint256[](addrs.length);
        for (uint256 i = 0; i < addrs.length; i++) {
            scores[i] = scoreOf(quizId, addrs[i]);
        }
    }

    function prizePool(uint256 quizId) public view returns (uint256) {
        Quiz storage z = _quizzes[quizId];
        if (z.totalScore == 0) return z.pot; // nobody scored: refund entry fees in full
        return z.pot - (z.pot * RAKE_BPS) / 10_000;
    }

    /// @notice Pari-mutuel: your share of the pot is your share of the score. Solvent by
    ///         construction — payouts can never exceed the prize pool.
    function payoutOf(uint256 quizId, address player) public view returns (uint256) {
        Quiz storage z = _quizzes[quizId];
        if (!joined[quizId][player] || claimed[quizId][player]) return 0;
        if (z.totalScore == 0) return z.entryFee; // full refund
        return (prizePool(quizId) * scoreOf(quizId, player)) / z.totalScore;
    }

    // ---------------------------------------------------------------- internals

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
