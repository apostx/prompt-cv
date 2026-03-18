import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

// Get AWS account ID and region
const accountId = execSync('aws sts get-caller-identity --query Account --output text').toString().trim();
const region = process.env.AWS_REGION || execSync('aws configure get region').toString().trim() || 'eu-central-1';
const bucket = `prompt-cv-mcp-server-${accountId}`;

console.log(`Deploying MCP server to s3://${bucket}/...`);

// Build
run('npm run build:mcp');

// Upload to S3
run(`aws s3 cp dist/mcp-server.mjs s3://${bucket}/mcp-server.mjs --region ${region}`);

// Restart the service on EC2 via SSM
try {
  const instanceId = execSync(
    `aws cloudformation describe-stacks --stack-name prompt-cv-mcp --region ${region} --query "Stacks[0].Outputs[?OutputKey=='McpEc2InstanceId'].OutputValue" --output text`
  ).toString().trim();

  if (instanceId && instanceId !== 'None') {
    console.log(`Restarting MCP server on instance ${instanceId}...`);
    run(
      `aws ssm send-command --instance-ids "${instanceId}" --document-name AWS-RunShellScript --region ${region} --parameters "commands=['cd /opt/mcp-server && aws s3 cp s3://${bucket}/mcp-server.mjs . --region ${region} && systemctl restart mcp-server']"`
    );
    console.log('Restart command sent.');
  }
} catch {
  console.log('Stack not deployed yet or instance not found. Upload complete.');
}
