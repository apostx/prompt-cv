import { execSync } from 'node:child_process';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const query = (cmd) => execSync(cmd, { encoding: 'utf-8' }).trim();

const STACK_NAME = 'prompt-cv';
const REGION = process.env.AWS_REGION || query('aws configure get region') || 'eu-central-1';
const ACM_CERT_ARN = 'arn:aws:acm:us-east-1:174054318087:certificate/4ff8e76f-9b43-4b97-8ec7-37c2771e1d23';

// 1. Build
console.log('Building prod stack...');
run('sam build');

// 2. Deploy CloudFormation
console.log('Deploying CloudFormation changes...');
const paramFlag = ACM_CERT_ARN ? ` --parameter-overrides "AcmCertificateArn=${ACM_CERT_ARN}"` : '';
try {
  run(
    `sam deploy --stack-name ${STACK_NAME} --region ${REGION} --resolve-s3 --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset${paramFlag}`,
  );
} catch {
  console.log('sam deploy failed or no changes — continuing with code upload.');
}

// 3. Upload Lambda code directly
console.log('Looking up Lambda function name...');
const physicalName = query(
  `aws cloudformation describe-stack-resource --stack-name ${STACK_NAME} --logical-resource-id CvApiFunction --region ${REGION} --query "StackResourceDetail.PhysicalResourceId" --output text`,
);
console.log(`\nUpdating CvApiFunction (${physicalName})...`);

const tmp = mkdtempSync(join(tmpdir(), 'deploy-prod-'));
const zipPath = join(tmp, 'CvApiFunction.zip');

run(
  `powershell -Command "Compress-Archive -Path '.aws-sam/build/CvApiFunction/*.js' -DestinationPath '${zipPath}' -Force"`,
);
run(
  `aws lambda update-function-code --function-name ${physicalName} --zip-file fileb://${zipPath} --region ${REGION} --output text --query "FunctionName"`,
);

unlinkSync(zipPath);
console.log('\nProd stack deploy complete!');
