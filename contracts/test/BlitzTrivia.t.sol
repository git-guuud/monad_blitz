// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BlitzTrivia} from "../src/BlitzTrivia.sol";

contract BlitzTriviaTest is Test {
    BlitzTrivia game;

    address host;
    address alice;
    address bob;
    address mallory;

    uint256 constant FEE = 0.01 ether;
    uint32 constant COMMIT_BLOCKS = 25;
    uint32 constant REVEAL_BLOCKS = 25;

    bytes32 constant HOST_SALT = keccak256("host-salt");
    uint8 constant CORRECT = 2;

    uint256 quizId;

    function setUp() public {
        host = makeAddr("host");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        mallory = makeAddr("mallory");

        game = new BlitzTrivia();
        vm.deal(host, 1 ether);
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
        vm.deal(mallory, 1 ether);
        vm.roll(1000);

        bytes32[] memory hc = new bytes32[](2);
        for (uint8 q = 0; q < 2; q++) {
            hc[q] = game.commitmentHash(0, q, CORRECT, HOST_SALT, host);
        }
        vm.prank(host);
        quizId = game.createQuiz(0, hc, FEE, COMMIT_BLOCKS, REVEAL_BLOCKS);
    }

    // ------------------------------------------------------------- helpers

    function _join(address who) internal {
        vm.prank(who);
        game.join{value: FEE}(quizId);
    }

    function _commit(address who, uint8 q, uint8 answer, bytes32 salt) internal {
        // hash first: vm.prank applies to the very next call, view calls included
        bytes32 c = game.commitmentHash(quizId, q, answer, salt, who);
        vm.prank(who);
        game.commitAnswer(quizId, q, c);
    }

    function _reveal(address who, uint8 q, uint8 answer, bytes32 salt) internal {
        vm.prank(who);
        game.revealAnswer(quizId, q, answer, salt);
    }

    function _startQuestion(uint8 q) internal {
        vm.prank(host);
        game.startQuestion(quizId, q);
    }

    function _enterReveal(uint8 q) internal {
        vm.roll(game.commitDeadline(quizId, q));
    }

    function _revealHost(uint8 q) internal {
        vm.prank(host);
        game.revealHostAnswer(quizId, q, CORRECT, HOST_SALT);
    }

    // ------------------------------------------------------------- the attack

    /// The whole point of the design. Mallory reads Alice's commitment off the
    /// mempool and submits the identical hash. She still cannot open it, because
    /// the commitment binds to msg.sender — Alice's reveal does not fit Mallory's.
    function test_copiedCommitmentCannotBeRevealed() public {
        _join(alice);
        _join(mallory);
        _startQuestion(0);

        bytes32 salt = keccak256("alice");
        bytes32 aliceCommitment = game.commitmentHash(quizId, 0, CORRECT, salt, alice);

        vm.prank(alice);
        game.commitAnswer(quizId, 0, aliceCommitment);

        // Mallory copies the hash verbatim. The contract happily accepts it...
        vm.prank(mallory);
        game.commitAnswer(quizId, 0, aliceCommitment);

        _enterReveal(0);
        _revealHost(0);
        _reveal(alice, 0, CORRECT, salt);

        // ...and it is worthless: replaying Alice's opening does not hash to it.
        vm.prank(mallory);
        vm.expectRevert(BlitzTrivia.BadReveal.selector);
        game.revealAnswer(quizId, 0, CORRECT, salt);

        assertGt(game.scoreOf(quizId, alice), 0);
        assertEq(game.scoreOf(quizId, mallory), 0);
    }

    /// quizId and questionIndex in the hash stop a commitment being replayed
    /// into a different round.
    function test_commitmentCannotBeReplayedAcrossQuestions() public {
        _join(alice);
        _startQuestion(0);

        bytes32 salt = keccak256("alice");
        bytes32 c0 = game.commitmentHash(quizId, 0, CORRECT, salt, alice);
        vm.prank(alice);
        game.commitAnswer(quizId, 0, c0);

        _enterReveal(0);
        vm.roll(game.revealDeadline(quizId, 0));
        _startQuestion(1);

        // same hash, next question
        vm.prank(alice);
        game.commitAnswer(quizId, 1, c0);
        _enterReveal(1);
        vm.prank(alice);
        vm.expectRevert(BlitzTrivia.BadReveal.selector);
        game.revealAnswer(quizId, 1, CORRECT, salt);
    }

    /// The host commits its answers before anyone plays, so it cannot switch the
    /// correct answer once it has seen what the room guessed.
    function test_hostCannotRevealADifferentAnswer() public {
        _join(alice);
        _startQuestion(0);
        _enterReveal(0);

        vm.prank(host);
        vm.expectRevert(BlitzTrivia.BadReveal.selector);
        game.revealHostAnswer(quizId, 0, 3, HOST_SALT);
    }

    function test_nobodyCanSeeAnAnswerBeforeTheReveal() public {
        _join(alice);
        _startQuestion(0);
        _commit(alice, 0, CORRECT, keccak256("alice"));

        BlitzTrivia.Commit memory c = game.getCommit(quizId, 0, alice);
        assertTrue(c.commitment != bytes32(0));
        assertFalse(c.revealed);
        assertEq(c.answer, 0); // storage carries no usable answer yet
        assertFalse(game.hostRevealed(quizId, 0));
    }

    // ------------------------------------------------------------- scoring

    /// Only meaningful with sub-second blocks: two correct answers score
    /// differently because they landed in different blocks.
    function test_speedBonusDecaysPerBlock() public {
        _join(alice);
        _join(bob);
        _startQuestion(0);

        _commit(alice, 0, CORRECT, keccak256("a")); // same block as the start
        vm.roll(block.number + 10);
        _commit(bob, 0, CORRECT, keccak256("b")); // 10 blocks later

        _enterReveal(0);
        _revealHost(0);
        _reveal(alice, 0, CORRECT, keccak256("a"));
        _reveal(bob, 0, CORRECT, keccak256("b"));

        assertEq(game.scoreOf(quizId, alice), 200); // 100 base + full 100 bonus
        assertEq(game.scoreOf(quizId, bob), 160); // 100 + 100 * 15/25
        assertGt(game.scoreOf(quizId, alice), game.scoreOf(quizId, bob));
    }

    /// Reveal order against the host must not matter — a player revealing before
    /// the host still scores.
    function test_revealBeforeHostStillScores() public {
        _join(alice);
        _join(bob);
        _startQuestion(0);
        _commit(alice, 0, CORRECT, keccak256("a"));
        _commit(bob, 0, CORRECT, keccak256("b"));

        _enterReveal(0);
        _reveal(alice, 0, CORRECT, keccak256("a")); // before the host
        _revealHost(0);
        _reveal(bob, 0, CORRECT, keccak256("b")); // after the host

        assertEq(game.scoreOf(quizId, alice), game.scoreOf(quizId, bob));
        assertEq(game.getQuiz(quizId).totalScore, 400);
    }

    /// A dropped phone must never deadlock the round.
    function test_noShowOnRevealScoresZeroAndRoundAdvances() public {
        _join(alice);
        _join(bob);
        _startQuestion(0);
        _commit(alice, 0, CORRECT, keccak256("a"));
        _commit(bob, 0, CORRECT, keccak256("b"));

        _enterReveal(0);
        _revealHost(0);
        _reveal(alice, 0, CORRECT, keccak256("a"));
        // bob closes the tab and never reveals

        vm.roll(game.revealDeadline(quizId, 0));
        assertEq(uint8(game.phaseOf(quizId, 0)), uint8(BlitzTrivia.Phase.SCORED));
        assertEq(game.scoreOf(quizId, bob), 0);

        _startQuestion(1); // the round moved on regardless
        assertEq(uint8(game.phaseOf(quizId, 1)), uint8(BlitzTrivia.Phase.COMMIT));
    }

    function test_wrongAnswerScoresZeroButKeepsPayingTheEntryFee() public {
        _join(alice);
        _startQuestion(0);
        _commit(alice, 0, 1, keccak256("a")); // wrong
        _enterReveal(0);
        _revealHost(0);
        _reveal(alice, 0, 1, keccak256("a"));

        assertEq(game.scoreOf(quizId, alice), 0);
        assertEq(game.getQuiz(quizId).pot, FEE);
    }

    // ------------------------------------------------------------- windows

    function test_cannotCommitAfterTheBuzzer() public {
        _join(alice);
        _startQuestion(0);
        _enterReveal(0);

        vm.prank(alice);
        vm.expectRevert(BlitzTrivia.WrongPhase.selector);
        game.commitAnswer(quizId, 0, bytes32(uint256(1)));
    }

    function test_cannotRevealDuringCommitPhase() public {
        _join(alice);
        _startQuestion(0);
        _commit(alice, 0, CORRECT, keccak256("a"));

        vm.prank(alice);
        vm.expectRevert(BlitzTrivia.WrongPhase.selector);
        game.revealAnswer(quizId, 0, CORRECT, keccak256("a"));
    }

    function test_cannotJoinOnceTheQuizHasStarted() public {
        _join(alice);
        _startQuestion(0);

        vm.prank(bob);
        vm.expectRevert(BlitzTrivia.QuizStarted.selector);
        game.join{value: FEE}(quizId);
    }

    function test_onlyHostDrivesTheGame() public {
        vm.prank(mallory);
        vm.expectRevert(BlitzTrivia.NotHost.selector);
        game.startQuestion(quizId, 0);
    }

    function test_cannotStartNextQuestionWhileCurrentIsOpen() public {
        _startQuestion(0);
        vm.prank(host);
        vm.expectRevert(BlitzTrivia.WrongPhase.selector);
        game.startQuestion(quizId, 1);
    }

    // ------------------------------------------------------------- money

    /// Pari-mutuel split, integer-safe, and the contract can never pay out more
    /// than it holds.
    function test_pariMutuelPayoutAndSolvency() public {
        _join(alice);
        _join(bob);
        _startQuestion(0);

        _commit(alice, 0, CORRECT, keccak256("a")); // 200 pts
        vm.roll(block.number + 10);
        _commit(bob, 0, CORRECT, keccak256("b")); // 160 pts

        _enterReveal(0);
        _revealHost(0);
        _reveal(alice, 0, CORRECT, keccak256("a"));
        _reveal(bob, 0, CORRECT, keccak256("b"));

        _playEmptyQuestion(1);
        game.finalize(quizId);

        uint256 pot = 2 * FEE;
        uint256 pool = pot - (pot * 500) / 10_000;
        assertEq(game.prizePool(quizId), pool);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        vm.prank(alice);
        game.claim(quizId);
        vm.prank(bob);
        game.claim(quizId);

        assertEq(alice.balance - aliceBefore, (pool * 200) / 360);
        assertEq(bob.balance - bobBefore, (pool * 160) / 360);
        assertGt(alice.balance - aliceBefore, bob.balance - bobBefore);

        uint256 hostBefore = host.balance;
        vm.prank(host);
        game.claimRake(quizId);
        assertEq(host.balance - hostBefore, pot - pool);

        assertLe(address(game).balance, 2); // only integer-division dust remains
    }

    /// If nobody scores, everybody gets their entry fee back and the house takes
    /// nothing. The contract cannot go insolvent mid-demo.
    function test_refundsEveryoneWhenNobodyScores() public {
        _join(alice);
        _join(bob);
        _playEmptyQuestion(0);
        _playEmptyQuestion(1);
        game.finalize(quizId);

        assertEq(game.getQuiz(quizId).totalScore, 0);

        uint256 before = alice.balance;
        vm.prank(alice);
        game.claim(quizId);
        assertEq(alice.balance - before, FEE);

        vm.prank(host);
        vm.expectRevert(BlitzTrivia.BadParams.selector);
        game.claimRake(quizId);
    }

    function test_cannotClaimTwice() public {
        _join(alice);
        _playEmptyQuestion(0);
        _playEmptyQuestion(1);
        game.finalize(quizId);

        vm.prank(alice);
        game.claim(quizId);
        vm.prank(alice);
        vm.expectRevert(BlitzTrivia.AlreadyClaimed.selector);
        game.claim(quizId);
    }

    function test_cannotClaimBeforeFinalize() public {
        _join(alice);
        vm.prank(alice);
        vm.expectRevert(BlitzTrivia.NotFinalized.selector);
        game.claim(quizId);
    }

    function test_cannotFinalizeWithQuestionsOutstanding() public {
        _join(alice);
        _playEmptyQuestion(0);
        vm.expectRevert(BlitzTrivia.WrongPhase.selector);
        game.finalize(quizId);
    }

    function _playEmptyQuestion(uint8 q) internal {
        if (q > 0) {
            uint64 prev = game.revealDeadline(quizId, q - 1);
            if (block.number < prev) vm.roll(prev);
        }
        _startQuestion(q);
        vm.roll(game.revealDeadline(quizId, q));
    }

    /// Payouts across a full field never exceed the prize pool.
    function testFuzz_payoutsNeverExceedThePrizePool(uint8 lateBlocks) public {
        lateBlocks = uint8(bound(lateBlocks, 0, COMMIT_BLOCKS - 1));
        _join(alice);
        _join(bob);
        _startQuestion(0);

        _commit(alice, 0, CORRECT, keccak256("a"));
        vm.roll(block.number + lateBlocks);
        _commit(bob, 0, CORRECT, keccak256("b"));

        _enterReveal(0);
        _revealHost(0);
        _reveal(alice, 0, CORRECT, keccak256("a"));
        _reveal(bob, 0, CORRECT, keccak256("b"));
        _playEmptyQuestion(1);
        game.finalize(quizId);

        uint256 total = game.payoutOf(quizId, alice) + game.payoutOf(quizId, bob);
        assertLe(total, game.prizePool(quizId));
    }
}
