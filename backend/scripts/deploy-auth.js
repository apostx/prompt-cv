import { execSync } from 'node:child_process';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const query = (cmd) => execSync(cmd, { encoding: 'utf-8' }).trim();

const STACK_NAME = 'prompt-cv-auth';
const TEMPLATE = 'template-auth.yaml';
const REGION = process.env.AWS_REGION || query('aws configure get region') || 'eu-central-1';

// 1. Build
console.log('Building auth stack...');
run(`sam build -t ${TEMPLATE}`);

// 2. Deploy CloudFormation (routes, env vars, IAM)
console.log('Deploying CloudFormation changes...');
try {
  run(
    `sam deploy -t ${TEMPLATE} --stack-name ${STACK_NAME} --region ${REGION} --resolve-s3 --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset`,
  );
} catch {
  console.log('sam deploy failed or no changes — continuing with code upload.');
}

// 3. Get physical Lambda function names from CloudFormation
console.log('Looking up Lambda function names...');
const functions = [
  { logical: 'AuthFunction', buildDir: '.aws-sam/build/AuthFunction' },
  { logical: 'CvAuthFunction', buildDir: '.aws-sam/build/CvAuthFunction' },
];

const tmp = mkdtempSync(join(tmpdir(), 'deploy-auth-'));

for (const fn of functions) {
  const physicalName = query(
    `aws cloudformation describe-stack-resource --stack-name ${STACK_NAME} --logical-resource-id ${fn.logical} --region ${REGION} --query "StackResourceDetail.PhysicalResourceId" --output text`,
  );
  console.log(`\nUpdating ${fn.logical} (${physicalName})...`);

  // Zip JS files only (skip .map to reduce upload size)
  const zipPath = join(tmp, `${fn.logical}.zip`);
  run(
    `powershell -Command "Compress-Archive -Path '${fn.buildDir}/*.js' -DestinationPath '${zipPath}' -Force"`,
  );

  // Upload directly to Lambda
  run(
    `aws lambda update-function-code --function-name ${physicalName} --zip-file fileb://${zipPath} --region ${REGION} --output text --query "FunctionName"`,
  );

  unlinkSync(zipPath);
}

console.log('\nAuth stack deploy complete!');
