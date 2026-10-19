resource "aws_dynamodb_table" "environment" {
  name         = "chat"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  lifecycle {
    #    prevent_destroy = true
    ignore_changes = [read_capacity, write_capacity]
  }

  # Delete older messages
  # ttl {
  #
  # }

  tags = {
    Name = "only chats table"
  }
}
