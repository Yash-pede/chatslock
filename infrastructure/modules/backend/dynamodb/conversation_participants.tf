# ----CONVERSATION PARTICIPANTS TABLE----
#
# Membership + per-user state for each conversation (M:N).
#
#   conversationId        S  partition key
#   userId                S  sort key (users.userId / Cognito sub)
#   role                  S  "owner" | "admin" | "member"
#   muted                 BOOL
#   lastReadMessageId     S
#   lastReadAt            N  epoch ms
#   unreadCount           N
#   notificationsEnabled  BOOL
#   joinedAt              N  epoch ms
resource "aws_dynamodb_table" "conversation_participants" {
  name         = "conversation_participants"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "conversationId"
  range_key = "userId"

  attribute {
    name = "conversationId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  # Every conversation a user belongs to.
  global_secondary_index {
    name = "userId_conversationId_GSI"
    key_schema {
      attribute_name = "userId"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "conversationId"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [read_capacity, write_capacity]
  }


  tags = {
    Name = "ConversationParticipantsTable"
  }
}
