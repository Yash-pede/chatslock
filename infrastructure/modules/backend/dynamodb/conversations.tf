# ----CONVERSATIONS TABLE----
#
# Item shape (non-key fields are free-form):
#   conversationId  S  partition key (uuid)
#   type            S  "direct" | "group" | "support"
#   name            S  group/support only
#   createdBy       S  users.userId
#   assignedAgentId S  users.userId (support only)
#   isClosed        BOOL
#   lastMessage     M  { messageId, preview, senderId, at }  -- denormalised cache
#   lastMessageAt   N  epoch ms, mirrors lastMessage.at
#   metadata        M
#   createdAt       N  epoch ms
#   updatedAt       N  epoch ms
#
# `lastMessage` is a nested map, but DynamoDB index keys must be top-level
# scalars, so `lastMessageAt` is kept as a separate top-level number to sort
# conversation lists on. Writers set both.
resource "aws_dynamodb_table" "conversations" {
  name         = "conversations"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "conversationId"

  attribute {
    name = "conversationId"
    type = "S"
  }

  attribute {
    name = "type"
    type = "S"
  }

  attribute {
    name = "createdBy"
    type = "S"
  }

  attribute {
    name = "assignedAgentId"
    type = "S"
  }

  attribute {
    name = "lastMessageAt"
    type = "N"
  }

  # Every conversation a user started, newest activity first.
  global_secondary_index {
    name = "createdBy_lastMessageAt_GSI"
    key_schema {
      attribute_name = "createdBy"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "lastMessageAt"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  # Everything assigned to an agent, newest activity first.
  global_secondary_index {
    name = "assignedAgentId_lastMessageAt_GSI"
    key_schema {
      attribute_name = "assignedAgentId"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "lastMessageAt"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  # The support/group queue by type, newest activity first.
  global_secondary_index {
    name = "type_lastMessageAt_GSI"
    key_schema {
      attribute_name = "type"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "lastMessageAt"
      key_type       = "RANGE"
    }
    projection_type = "ALL"
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [read_capacity, write_capacity]
  }

  tags = {
    Name = "ConversationsTable"
  }
}
