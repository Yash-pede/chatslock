# DynamoDB tables for the backend.
#
# One file per table:
#   users.tf, conversations.tf, conversation_participants.tf
#
# Terraform treats every `.tf` file in this directory as a single module, so
# splitting tables into their own files changes nothing in the resource
# addresses (and therefore nothing in state).
#
# Table names are fixed ("users", "conversations") to match the constants in
# `@repo/api/types`, which the lambdas use as the TableName on every call.
