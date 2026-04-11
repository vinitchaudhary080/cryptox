"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"

const candleData = [
  { height: 32, wickTop: 8, wickBottom: 12, bullish: true },
  { height: 24, wickTop: 10, wickBottom: 6, bullish: false },
  { height: 40, wickTop: 6, wickBottom: 10, bullish: true },
  { height: 20, wickTop: 14, wickBottom: 8, bullish: true },
  { height: 36, wickTop: 8, wickBottom: 12, bullish: false },
  { height: 28, wickTop: 10, wickBottom: 6, bullish: true },
]

function Candle({
  height,
  wickTop,
  wickBottom,
  bullish,
  delay,
}: {
  height: number
  wickTop: number
  wickBottom: number
  bullish: boolean
  delay: number
}) {
  const totalHeight = wickTop + height + wickBottom
  const color = bullish ? "oklch(0.7 0.2 155)" : "oklch(0.65 0.22 25)"

  return (
    <motion.div
      className="flex flex-col items-center"
      style={{ height: totalHeight }}
      initial={{ opacity: 0.3, scaleY: 0.5 }}
      animate={{ opacity: [0.3, 1, 0.3], scaleY: [0.5, 1, 0.5] }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        delay,
        ease: "easeInOut",
      }}
    >
      {/* Top wick */}
      <div
        className="w-px"
        style={{ height: wickTop, backgroundColor: color }}
      />
      {/* Body */}
      <div
        className="w-2 rounded-sm"
        style={{ height, backgroundColor: color }}
      />
      {/* Bottom wick */}
      <div
        className="w-px"
        style={{ height: wickBottom, backgroundColor: color }}
      />
    </motion.div>
  )
}

export function TradingLoader({ message, delay = 300 }: { message?: string; delay?: number }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  if (!show) return null

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      {/* Candlestick chart animation */}
      <div className="flex items-end gap-1.5">
        {candleData.map((candle, i) => (
          <Candle
            key={i}
            {...candle}
            delay={i * 0.15}
          />
        ))}
      </div>

      {/* Price line animation */}
      <div className="relative h-px w-24 overflow-hidden rounded-full bg-border/50">
        <motion.div
          className="absolute inset-y-0 w-8 rounded-full bg-primary/60"
          animate={{ x: [-32, 96] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {message && (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  )
}
