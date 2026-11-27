import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { View } from "react-native"
import { Button, SafeArea, Spinner, Text } from "@repo/ui"
import { openLocalDatabase, type Database } from "./client"

interface LocalDbContextValue {
  db: Database
}

const LocalDbContext = createContext<LocalDbContextValue | null>(null)

function DatabaseLoading() {
  return (
    <SafeArea>
      <View className="flex-1 items-center justify-center">
        <Spinner />
      </View>
    </SafeArea>
  )
}

/**
 * Opens the on-device database and applies pending migrations before any
 * screen renders, so consumers can assume the schema is ready.
 */
export function LocalDbProvider({
  children,
  fallback,
}: {
  children: React.ReactNode
  /** Shown while the database opens; defaults to a plain spinner. */
  fallback?: React.ReactNode
}) {
  const [db, setDb] = useState<Database | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    void openLocalDatabase()
      .then(({ db: next }) => {
        if (!cancelled) {
          setDb(next)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not open the local database.")
        }
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((value) => value + 1)
  }, [])

  if (error) {
    console.log(error)
    return (
      <SafeArea>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text variant="h2" className="text-center">
            Couldn&apos;t open local storage
          </Text>
          <Text variant="muted" className="text-center">
            {error}
          </Text>
          <Button onPress={retry}>Try again</Button>
        </View>
      </SafeArea>
    )
  }

  if (!db) return <>{fallback ?? <DatabaseLoading />}</>

  return <LocalDbContext.Provider value={{ db }}>{children}</LocalDbContext.Provider>
}

/** The migrated local database. Must be used inside `<LocalDbProvider>`. */
export function useLocalDb(): LocalDbContextValue {
  const instance = useContext(LocalDbContext)
  if (!instance) {
    throw new Error("useLocalDb must be used inside <LocalDbProvider>")
  }
  return instance
}
