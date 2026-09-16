.PHONY: install compile test validate world demo agent clean

install:
	npm install

compile:
	npm run compile

test:
	npm test

validate:
	npm run validate

world:
	npm run world

demo:
	npm run demo

agent:
	npm run agent

clean:
	rm -rf node_modules proof-kernel/target contracts/artifacts reports/contract-sizes.json
