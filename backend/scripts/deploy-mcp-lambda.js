import { execSync } from 'node:child_process';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const query = (cmd) => execSync(cmd, { encoding: 'utf-8' }).trim();

const STACK_NAME = 'prompt-cv-mcp-lambda';
const TEMPLATE = 'template-mcp-lambda.yaml';
const REGION = process.env.AWS_REGION || query('aws configure get region') || 'eu-central-1';

// 1. Build
console.log('Building MCP Lambda stack...');
run(`sam build -t ${TEMPLATE}`);

// 2. Deploy CloudFormation
console.log('Deploying CloudFormation changes...');
try {
  run(
    `sam deploy -t ${TEMPLATE} --stack-name ${STACK_NAME} --region ${REGION} --resolve-s3 --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset`,
  );
} catch {
  console.log('sam deploy failed or no changes — continuing with code upload.');
}

// 3. Upload Lambda code directly (workaround for SAM esbuild bug on Windows)
console.log('Looking up Lambda function name...');
const physicalName = query(
  `aws cloudformation describe-stack-resource --stack-name ${STACK_NAME} --logical-resource-id McpLambdaFunction --region ${REGION} --query "StackResourceDetail.PhysicalResourceId" --output text`,
);
console.log(`\nUpdating McpLambdaFunction (${physicalName})...`);

const tmp = mkdtempSync(join(tmpdir(), 'deploy-mcp-lambda-'));
const zipPath = join(tmp, 'McpLambdaFunction.zip');

run(
  `powershell -Command "Compress-Archive -Path '.aws-sam/build/McpLambdaFunction/*.js' -DestinationPath '${zipPath}' -Force"`,
);
run(
  `aws lambda update-function-code --function-name ${physicalName} --zip-file fileb://${zipPath} --region ${REGION} --output text --query "FunctionName"`,
);

unlinkSync(zipPath);

// 4. Show the Function URL
try {
  const functionUrl = query(
    `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} --query "Stacks[0].Outputs[?OutputKey=='McpLambdaFunctionUrl'].OutputValue" --output text`,
  );
  console.log(`\nMCP Lambda deploy complete!`);
  console.log(`Function URL: ${functionUrl}`);
  console.log(`MCP endpoint: ${functionUrl}mcp`);
} catch {
  console.log('\nMCP Lambda deploy complete! (could not retrieve Function URL from stack outputs)');
}
