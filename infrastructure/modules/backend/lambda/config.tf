# ---- IAM ----

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api_lambda_role" {
  name               = "api-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.api_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc_access" {
  role       = aws_iam_role.api_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "api_lambda_policy" {
  name = "api-lambda-policy"
  role = aws_iam_role.api_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "secretsmanager:GetSecretValue"
        ],
        Resource = var.api_lambda_secret_arn
      },
      {
        Sid    = "AllowS3MediaAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.s3_media_bucket_name}",
          "arn:aws:s3:::${var.s3_media_bucket_name}/*"
        ]
      },
      {
        Sid    = "AllowCognitoAdminAllPools"
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
          "cognito-idp:AdminGetUser",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminResetUserPassword",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDeleteUserAttributes",
          "cognito-idp:AdminUserGlobalSignOut",
          "cognito-idp:RevokeToken"
        ]
        Resource = ["*"]
      },
      {
        Sid    = "AllowDynamodb"
        Effect = "Allow",
        Action = [
          "dynamodb:*"
        ],
        Resource = ["*"]
      },
    ]
  })
}

# ---- API Gateway invoke permission ----

resource "aws_lambda_permission" "api_gateway" {
  for_each = local.api_lambdas

  statement_id  = "AllowApiGatewayInvoke-${each.value.name}"
  action        = "lambda:InvokeFunction"
  function_name = each.value.name

  principal = "apigateway.amazonaws.com"

  source_arn = "${var.api_gateway_execution_arn}/*/*/api/${each.value.name}/{proxy+}"
}

# ---- Security group ----

resource "aws_security_group" "api_lambda_sg" {
  name   = "api-lambda-sg"
  vpc_id = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
