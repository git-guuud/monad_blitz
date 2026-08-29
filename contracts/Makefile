-include .env
export

RPC_TESTNET := https://testnet-rpc.monad.xyz
RPC_MAINNET := https://rpc.monad.xyz

.PHONY: build test fmt wallet balance deploy-testnet deploy-mainnet verify-testnet verify-mainnet

build:   ; forge build
test:    ; forge test -vvv
fmt:     ; forge fmt

## make wallet — create a fresh burner keypair
wallet:  ; cast wallet new

## make balance — check the deployer has faucet MON
balance:
	@cast balance $$(cast wallet address --private-key $(PRIVATE_KEY)) \
		--rpc-url $(RPC_TESTNET) --ether

## make deploy-testnet CONTRACT=Counter
CONTRACT ?= Counter
deploy-testnet:
	forge create src/$(CONTRACT).sol:$(CONTRACT) \
		--rpc-url $(RPC_TESTNET) --private-key $(PRIVATE_KEY) --broadcast

deploy-mainnet:
	forge create src/$(CONTRACT).sol:$(CONTRACT) \
		--rpc-url $(RPC_MAINNET) --private-key $(PRIVATE_KEY) --broadcast

## make verify-testnet ADDR=0x... CONTRACT=Counter   <- worth 25 rubric points
verify-testnet:
	forge verify-contract $(ADDR) src/$(CONTRACT).sol:$(CONTRACT) \
		--chain 10143 --verifier etherscan \
		--verifier-url "https://api.etherscan.io/v2/api?chainid=10143" \
		--etherscan-api-key $(ETHERSCAN_API_KEY) --watch

verify-mainnet:
	forge verify-contract $(ADDR) src/$(CONTRACT).sol:$(CONTRACT) \
		--chain 143 --verifier etherscan \
		--verifier-url "https://api.etherscan.io/v2/api?chainid=143" \
		--etherscan-api-key $(ETHERSCAN_API_KEY) --watch

## make abi — regenerate the frontend ABI from the compiled artifact
abi: build
	@node -e 'const a=require("./out/BlitzTrivia.sol/BlitzTrivia.json").abi;\
	  const fs=require("fs"),p="../web/src/lib/contract.ts";\
	  const s=fs.readFileSync(p,"utf8").replace(/export const CONTRACT_ABI = [\s\S]*$$/,\
	    "export const CONTRACT_ABI = "+JSON.stringify(a,null,2)+" as const;\n");\
	  fs.writeFileSync(p,s);console.log("web/src/lib/contract.ts updated")'
