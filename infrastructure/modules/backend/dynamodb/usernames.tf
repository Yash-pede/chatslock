# ----USERNAMES TABLE----
#
# Uniqueness reservations for usernames.
#
# DynamoDB conditions can only see the item being written, so uniqueness across
# the table is enforced with one reservation item per username, written in the
# same transaction as the user item.
#
#   username  S  partition key, lowercased + trimmed username
#   userId    S  users.userId that currently owns the username
#   createdAt N  epoch ms
resource "aws_dynamodb_table" "usernames" {
  name         = "usernames"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "username"

  attribute {
    name = "username"
    type = "S"
  }

  lifecycle {
#    prevent_destroy = true
    ignore_changes  = [read_capacity, write_capacity]
  }

  tags = {
    Name = "UsernamesTable"
  }
}
