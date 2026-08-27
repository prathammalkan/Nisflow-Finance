"use client"
import * as React from "react"
import { cn } from "@/lib/utils"

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
  tabIds: Map<string, string>    // value -> tab button id
  panelIds: Map<string, string>  // value -> panel id
  tabValues: string[]            // ordered list of tab values
  registerTab: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext(): TabsContextValue {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error("Component must be used within Tabs")
  return ctx
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}) {
  const [activeTab, setActiveTab] = React.useState(value || defaultValue || "")
  const tabIds = React.useRef<Map<string, string>>(new Map())
  const panelIds = React.useRef<Map<string, string>>(new Map())
  const tabValuesRef = React.useRef<string[]>([])

  React.useEffect(() => {
    if (value !== undefined) {
      setActiveTab(value)
    }
  }, [value])

  const handleValueChange = (newValue: string) => {
    if (value === undefined) {
      setActiveTab(newValue)
    }
    onValueChange?.(newValue)
  }

  const registerTab = (tabValue: string) => {
    if (!tabIds.current.has(tabValue)) {
      const uid = `tab-${tabValue.replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`
      tabIds.current.set(tabValue, uid)
      panelIds.current.set(tabValue, `panel-${uid}`)
      tabValuesRef.current = [...tabValuesRef.current, tabValue]
    }
  }

  return (
    <TabsContext.Provider
      value={{
        value: activeTab,
        onValueChange: handleValueChange,
        tabIds: tabIds.current,
        panelIds: panelIds.current,
        tabValues: tabValuesRef.current,
        registerTab,
      }}
    >
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const ctx = useTabsContext()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = ctx.tabValues
    if (tabs.length === 0) return
    const currentIdx = tabs.indexOf(ctx.value)

    let nextIdx: number | null = null
    if (e.key === "ArrowRight") {
      nextIdx = (currentIdx + 1) % tabs.length
    } else if (e.key === "ArrowLeft") {
      nextIdx = (currentIdx - 1 + tabs.length) % tabs.length
    } else if (e.key === "Home") {
      nextIdx = 0
    } else if (e.key === "End") {
      nextIdx = tabs.length - 1
    }

    if (nextIdx !== null) {
      e.preventDefault()
      const nextValue = tabs[nextIdx]
      ctx.onValueChange(nextValue)
      // Move focus to the newly selected tab button
      const tabId = ctx.tabIds.get(nextValue)
      if (tabId) {
        const el = document.getElementById(tabId)
        el?.focus()
      }
    }
  }

  return (
    <div
      ref={ref}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        "flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
TabsList.displayName = "TabsList"

export const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const ctx = useTabsContext()
  ctx.registerTab(value)

  const isActive = ctx.value === value
  const tabId = ctx.tabIds.get(value)
  const panelId = ctx.panelIds.get(value)

  return (
    <button
      ref={ref}
      id={tabId}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        className
      )}
      data-state={isActive ? "active" : "inactive"}
      {...props}
    />
  )
})
TabsTrigger.displayName = "TabsTrigger"

export const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const ctx = useTabsContext()

  const isActive = ctx.value === value
  const panelId = ctx.panelIds.get(value)
  const tabId = ctx.tabIds.get(value)

  if (!isActive) return null

  return (
    <div
      ref={ref}
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  )
})
TabsContent.displayName = "TabsContent"
