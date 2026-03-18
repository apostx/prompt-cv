# AWS Account Setup

This guide walks you through setting up AWS for Prompt CV.

## 1. Create an AWS Account

1. Go to [aws.amazon.com](https://aws.amazon.com/) and create a new account
2. AWS offers a **12-month Free Tier** that covers all resources Prompt CV needs:
   - Lambda: 1M free requests/month
   - DynamoDB: 25GB storage, 25 read/write capacity units
   - S3: 5GB storage
   - CloudFront: 1TB data transfer
   - EC2 t3.micro: 750 hours/month (MCP server)

## 2. Install AWS CLI & SAM CLI

```bash
# Install AWS CLI
# https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

# Install SAM CLI
# https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# Configure credentials
aws configure
# Enter your Access Key ID, Secret Access Key, and region (e.g., eu-central-1)
```

## 3. Deploy the Three Stacks

The project has three CloudFormation stacks that must be deployed in order:

```
Stack 1: prompt-cv (prod)     → outputs: ApiEndpoint, FrontendUrl
Stack 2: prompt-cv-auth       → outputs: AuthApiEndpoint, CvAuthFunction name/ARN
Stack 3: prompt-cv-mcp        → inputs from Stack 1 + 2
Frontend deploy               → after Stack 1 + 2 (reads outputs automatically)
```

### Stack 1: Prod (CV API + Frontend Hosting)

```bash
cd backend
npm install
sam build
sam deploy --guided
# Stack name: prompt-cv
# Region: your preferred region (e.g., eu-central-1)
# Provide: GoogleClientId, GoogleClientSecret, GoogleRefreshToken
```

Retrieve outputs for later stacks:

```bash
aws cloudformation describe-stacks --stack-name prompt-cv \
  --query "Stacks[0].Outputs" --output table
```

Note these values:
- **ApiEndpoint** → used as `ApiUrl` for MCP stack
- **FrontendUrl** → used as `FrontendUrl` for Auth and MCP stacks

### Stack 2: Auth (OAuth + DynamoDB)

```bash
sam build -t template-auth.yaml
sam deploy --config-file samconfig-auth.toml \
  --resolve-s3 \
  --parameter-overrides \
    GoogleClientId=YOUR_CLIENT_ID \
    GoogleClientSecret=YOUR_CLIENT_SECRET \
    JwtSecret=$(openssl rand -hex 32) \
    FrontendUrl=FRONTEND_URL_FROM_STACK_1
```

> **Important:** After deploying, add the Auth API callback URLs to your Google OAuth redirect URIs:
> - `{AuthApiEndpoint}/auth/google/callback` (web login)
> - `{AuthApiEndpoint}/oauth/callback` (MCP OAuth)

Retrieve outputs:

```bash
aws cloudformation describe-stacks --stack-name prompt-cv-auth \
  --query "Stacks[0].Outputs" --output table
```

Note these values:
- **AuthApiEndpoint** → used as `AuthApiUrl` for MCP stack

Get CvAuthFunction details (needed for MCP stack):

```bash
# Function name
aws cloudformation describe-stack-resources --stack-name prompt-cv-auth \
  --query "StackResources[?LogicalResourceId=='CvAuthFunction'].PhysicalResourceId" \
  --output text

# Function ARN
aws lambda get-function-configuration \
  --function-name FUNCTION_NAME_FROM_ABOVE \
  --query "FunctionArn" --output text
```

### Stack 3: MCP (EC2 + CloudFront)

```bash
# Build the MCP server bundle
npm run build:mcp

# Create S3 bucket for the bundle (one-time)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 mb s3://prompt-cv-mcp-server-${ACCOUNT_ID}

# Upload bundle
aws s3 cp dist/mcp-server.mjs s3://prompt-cv-mcp-server-${ACCOUNT_ID}/

# Deploy the stack
sam build -t template-mcp.yaml
sam deploy --config-file samconfig-mcp.toml \
  --resolve-s3 \
  --parameter-overrides \
    ApiUrl=API_ENDPOINT_FROM_STACK_1 \
    AuthApiUrl=AUTH_API_ENDPOINT_FROM_STACK_2 \
    CvAuthFunctionName=CV_AUTH_FUNCTION_NAME_FROM_STACK_2 \
    CvAuthFunctionArn=CV_AUTH_FUNCTION_ARN_FROM_STACK_2 \
    GoogleClientId=YOUR_CLIENT_ID \
    GoogleClientSecret=YOUR_CLIENT_SECRET \
    FrontendUrl=FRONTEND_URL_FROM_STACK_1
```

### Stack 2 Update: Add MCP URL

After Stack 3 is deployed, update the Auth stack with the MCP URL so the frontend can display it:

```bash
MCP_URL=$(aws cloudformation describe-stacks --stack-name prompt-cv-mcp \
  --query "Stacks[0].Outputs[?OutputKey=='McpServerUrl'].OutputValue" --output text)

sam build -t template-auth.yaml
sam deploy --config-file samconfig-auth.toml \
  --resolve-s3 \
  --parameter-overrides \
    GoogleClientId=YOUR_CLIENT_ID \
    GoogleClientSecret=YOUR_CLIENT_SECRET \
    JwtSecret=YOUR_JWT_SECRET \
    FrontendUrl=FRONTEND_URL_FROM_STACK_1 \
    McpUrl=${MCP_URL}
```

### Deploy Frontend

The deploy script automatically discovers API URLs from stack outputs, builds, and deploys:

```bash
cd ../frontend
npm install
node scripts/deploy.js
```

## 4. Environment Variables for Local Development

Create `backend/env.json` (gitignored) for `sam local`:

```json
{
  "CvApiFunction": {
    "GOOGLE_CLIENT_ID": "...",
    "GOOGLE_CLIENT_SECRET": "...",
    "GOOGLE_REFRESH_TOKEN": "..."
  }
}
```

See `backend/env.json.example` for the full template.

## 5. GitHub Actions CI/CD (Optional)

The project includes `.github/workflows/deploy.yml` for automated deployment on push to `main`. It uses path-based change detection to only deploy affected stacks.

### Required Repository Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_ARN` | IAM role ARN for GitHub OIDC authentication |
| `AWS_ACCOUNT_ID` | Your AWS account ID |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID (prod stack) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret (prod stack) |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth Refresh Token (prod stack shared service account) |
| `JWT_SECRET` | Secret key for signing JWTs (auth stack) |
| `FRONTEND_URL` | CloudFront URL of the frontend (e.g., `https://dXXXXX.cloudfront.net`) |
| `MCP_URL` | MCP server CloudFront URL (e.g., `https://dXXXXX.cloudfront.net/mcp`) |

### Setting Up OIDC Authentication

Instead of storing AWS access keys, the workflow uses OIDC federation:

1. Create an IAM OIDC identity provider for `token.actions.githubusercontent.com`
2. Create an IAM role with permissions for SAM deployment, S3, CloudFront, SSM
3. Set the role's trust policy to allow your GitHub repository
4. Store the role ARN as `AWS_ROLE_ARN` in repository secrets
