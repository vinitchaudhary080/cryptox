"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  User,
  Key,
  Bell,
  Shield,
  Globe,
  Smartphone,
  Send,
  Plus,
  Check,
  ExternalLink,
  Trash2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

export default function SettingsPage() {
  const [telegramConnected, setTelegramConnected] = useState(false)

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, exchanges, and notifications
        </p>
      </motion.div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="profile" className="gap-1.5 text-xs">
            <User className="h-3.5 w-3.5" /> Profile
          </TabsTrigger>
          <TabsTrigger value="exchanges" className="gap-1.5 text-xs">
            <Key className="h-3.5 w-3.5" /> Exchanges
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5 text-xs">
            <Bell className="h-3.5 w-3.5" /> Alerts
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" /> Security
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <motion.div variants={fadeUp}>
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
                      JD
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Button variant="outline" size="sm">Change Avatar</Button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Full Name</Label>
                    <Input defaultValue="John Doe" className="mt-1.5 bg-muted/50" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input defaultValue="john@example.com" className="mt-1.5 bg-muted/50" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Display Name</Label>
                    <Input defaultValue="CryptoJohn" className="mt-1.5 bg-muted/50" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Timezone</Label>
                    <Input defaultValue="UTC+5:30" className="mt-1.5 bg-muted/50" />
                  </div>
                </div>
                <Button>Save Changes</Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Exchanges Tab */}
        <TabsContent value="exchanges">
          <motion.div variants={fadeUp} className="space-y-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Connected Exchanges</CardTitle>
                  <Button size="sm">
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Exchange
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Delta Exchange — Connected */}
                <div className="flex items-center justify-between rounded-lg border border-profit/20 bg-profit/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background font-bold text-sm">
                      DE
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">Delta Exchange</p>
                        <Badge className="bg-profit/10 text-profit text-[10px]">
                          <Check className="mr-1 h-2.5 w-2.5" /> Connected
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        API Key: ****...7x2f &middot; Trade Only
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">Edit</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-loss">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Other exchanges — not connected */}
                {["Binance", "Bybit", "OKX"].map((exchange) => (
                  <div key={exchange} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted font-bold text-sm text-muted-foreground">
                        {exchange.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{exchange}</p>
                        <p className="text-xs text-muted-foreground">Not connected</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Connect</Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex items-center gap-4 p-4">
                <Shield className="h-5 w-5 shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Security Note</p>
                  <p className="text-xs text-muted-foreground">
                    We only request trade-only API permissions. Your funds remain on the exchange — we never have withdrawal access.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <motion.div variants={fadeUp} className="space-y-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Notification Channels</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Telegram */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#229ED9]/10">
                      <Send className="h-5 w-5 text-[#229ED9]" />
                    </div>
                    <div>
                      <p className="font-medium">Telegram</p>
                      <p className="text-xs text-muted-foreground">
                        {telegramConnected
                          ? "Connected to @CryptoJohn"
                          : "Get instant alerts on Telegram"}
                      </p>
                    </div>
                  </div>
                  {telegramConnected ? (
                    <Badge className="bg-profit/10 text-profit">
                      <Check className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  ) : (
                    <Button size="sm" onClick={() => setTelegramConnected(true)}>
                      Connect
                    </Button>
                  )}
                </div>

                {/* Email */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Email</p>
                      <p className="text-xs text-muted-foreground">john@example.com</p>
                    </div>
                  </div>
                  <Badge className="bg-profit/10 text-profit">
                    <Check className="mr-1 h-3 w-3" /> Active
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Alert Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Trade Executed", description: "When a strategy places a buy/sell order", defaultOn: true },
                  { label: "Stop Loss Triggered", description: "When a stop loss is hit", defaultOn: true },
                  { label: "Take Profit Hit", description: "When take profit target is reached", defaultOn: true },
                  { label: "Strategy Errors", description: "When a strategy encounters an issue", defaultOn: true },
                  { label: "Daily Summary", description: "Daily PnL and performance digest", defaultOn: false },
                  { label: "Price Alerts", description: "Custom price level notifications", defaultOn: false },
                ].map((alert) => (
                  <div key={alert.label} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{alert.label}</p>
                      <p className="text-xs text-muted-foreground">{alert.description}</p>
                    </div>
                    <Switch defaultChecked={alert.defaultOn} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <motion.div variants={fadeUp} className="space-y-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Security Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
                  </div>
                  <Button variant="outline" size="sm">Enable 2FA</Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Change Password</p>
                    <p className="text-xs text-muted-foreground">Last changed 30 days ago</p>
                  </div>
                  <Button variant="outline" size="sm">Update</Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Active Sessions</p>
                    <p className="text-xs text-muted-foreground">2 devices currently logged in</p>
                  </div>
                  <Button variant="outline" size="sm">Manage</Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">API IP Whitelisting</p>
                    <p className="text-xs text-muted-foreground">Restrict API access to specific IPs</p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
