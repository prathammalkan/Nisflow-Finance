"use client"
import * as React from "react"
import { Decimal } from "decimal.js"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { formatINR } from "@/lib/finance/money"

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: number | string
  onChange?: (value: number | undefined) => void
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, onBlur, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState("")

    React.useEffect(() => {
      if (value !== undefined && value !== null) {
        try {
          // If it's a number, format it
          const dec = new Decimal(value)
          if (!isNaN(dec.toNumber())) {
            setDisplayValue(formatINR(dec.toNumber()).replace("₹", "").trim())
          }
        } catch {
          // ignore
        }
      } else {
        setDisplayValue("")
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value
      // Allow only numbers, decimals, and commas
      val = val.replace(/[^0-9.,]/g, "")
      setDisplayValue(val)
      
      const cleanVal = val.replace(/,/g, "")
      if (cleanVal === "") {
        onChange?.(undefined)
      } else {
        try {
          const num = new Decimal(cleanVal).toNumber()
          if (!isNaN(num)) {
            onChange?.(num)
          }
        } catch {
          // invalid number
        }
      }
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const cleanVal = displayValue.replace(/,/g, "")
      if (cleanVal) {
        try {
          const num = new Decimal(cleanVal).toNumber()
          if (!isNaN(num)) {
            setDisplayValue(formatINR(num).replace("₹", "").trim())
          }
        } catch {
          // ignore
        }
      }
      onBlur?.(e)
    }

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          ₹
        </span>
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          className={cn("pl-7", className)}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          {...props}
        />
      </div>
    )
  }
)
CurrencyInput.displayName = "CurrencyInput"

export { CurrencyInput }
