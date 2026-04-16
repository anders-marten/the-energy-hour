# Guide: Static Website with AWS CI/CD (GitHub -> CodePipeline -> CodeBuild -> S3 -> CloudFront)

This document describes a proven workflow to set up a static website with CI/CD on AWS. It includes step-by-step instructions, explanations, common pitfalls, and solutions.

## 1. Setup GitHub and VS Code

1. Create a new empty repository in GitHub.
2. Open VS Code.
3. Clone the repository via Explorer -> Clone Repository.
4. Select the repo and choose a local folder.
5. Verify the folder structure locally.
6. Open Copilot Chat.
7. Ask Copilot to create a simple `index.html` (Hello World).
8. Commit and push the code.

## 2. Setup AWS Infrastructure

1. Create an S3 bucket for hosting (for example, `the-energy-hour`).
2. Create a CloudFront distribution pointing to the S3 bucket.
3. Set Default Root Object to `index.html`.
4. Upload `index.html` manually to S3.
5. Verify the site via the CloudFront URL.

## 3. Setup Vite (Build Tool)

Use Copilot to introduce Vite into the project.

Ensure:
- Output goes to `dist/`
- `npm run build` works
- Project remains simple (no frameworks)

## 4. Setup CI/CD Pipeline

1. Go to AWS CodePipeline.
2. Create a new pipeline.
3. Source: GitHub (via CodeConnections).
4. Build: AWS CodeBuild.
5. Create CodeBuild project from pipeline.
6. Use `buildspec.yml` from repo.
7. Skip test and deploy stages.

## 5. IAM Permissions

Ensure the CodeBuild role has access to:
- Pipeline artifact bucket (read/write)
- Website bucket (read/write)
- CloudFront invalidation
- CloudWatch logs

## 6. Common Pitfalls and Solutions

1. AccessDenied (S3 GetObject): Missing read permission to pipeline artifact bucket.
2. AccessDenied (S3 PutObject): Missing write permission to artifact bucket.
3. Buildspec not found: File missing in repo root.
4. Wrong region: Ensure all services use same region.
5. CloudFront not updating: Missing invalidation permission.
6. Vite build fails: Missing `package-lock.json` or `npm ci` issues.
