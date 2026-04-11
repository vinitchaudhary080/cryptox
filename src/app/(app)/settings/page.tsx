"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  User,
  Key,
  Bell,
  Shield,
  Globe,
  Send,
  Plus,
  Check,
  Trash2,
  Loader2,
  TrendingUp,
  BarChart3,
  Calendar,
  Zap,
  Plug,
  Mail,
  Phone,
  MapPin,
  Clock,
  Edit3,
  Save,
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
import { userApi } from "@/lib/api"
import { TradingLoader } from "@/components/ui/trading-loader"
import { useAuthStore } from "@/stores/auth-store"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

type Profile = {
  id: string
  email: string
  name: string | null
  displayName: string | null
  phone: string | null
  bio: string | null
  timezone: string
  country: string | null
  avatarUrl: string | null
  plan: string
  hasPassword: boolean
  hasGoogle: boolean
  createdAt: string
  updatedAt: string
  _count: { brokers: number; deployedStrategies: number }
  stats: {
    totalTrades: number
    totalPnl: number
    winRate: number
    activeBrokers: number
    activeStrategies: number
    memberSince: string
  }
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [telegramConnected, setTelegramConnected] = useState(false)
  const { user: authUser } = useAuthStore()

  // Form fields
  const [name, setName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [bio, setBio] = useState("")
  const [timezone, setTimezone] = useState("")
  const [country, setCountry] = useState("")

  // Password change
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    userApi.getProfile().then((res) => {
      if (res.success && res.data) {
        const p = res.data as Profile
        setProfile(p)
        setName(p.name || "")
        setDisplayName(p.displayName || "")
        setPhone(p.phone || "")
        setBio(p.bio || "")
        setTimezone(p.timezone || "UTC+5:30")
        setCountry(p.country || "")
      }
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    const res = await userApi.updateProfile({
      name: name || undefined,
      displayName: displayName || undefined,
      phone: phone || undefined,
      bio: bio || undefined,
      timezone: timezone || undefined,
      country: country || undefined,
    })
    setSaving(false)
    if (res.success) {
      setSaved(true)
      setEditing(false)
      if (res.data) setProfile(res.data as Profile)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const handlePasswordChange = async () => {
    setPasswordMsg(null)
    const res = await userApi.changePassword(currentPassword, newPassword)
    if (res.success) {
      setPasswordMsg({ type: "success", text: "Password updated successfully" })
      setCurrentPassword("")
      setNewPassword("")
    } else {
      setPasswordMsg({ type: "error", text: res.error || "Failed to update password" })
    }
  }

  const initials = profile?.name
    ? profile.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : profile?.email?.slice(0, 2).toUpperCase() || "U"

  if (loading) {
    return <TradingLoader message="Loading settings..." />
  }

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
          <TabsTrigger value="alerts" className="gap-1.5 text-xs">
            <Bell className="h-3.5 w-3.5" /> Alerts
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" /> Security
          </TabsTrigger>
        </TabsList>

        {/* ══════════ Profile Tab ══════════ */}
        <TabsContent value="profile" className="space-y-6">
          {/* Profile header card */}
          <motion.div variants={fadeUp}>
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-lg font-bold">
                        {profile?.name || profile?.email}
                      </h2>
                      {profile?.displayName && (
                        <p className="text-sm text-muted-foreground">@{profile.displayName}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {profile?.plan}
                        </Badge>
                        {profile?.hasGoogle && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Globe className="h-2.5 w-2.5" /> Google
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={editing ? "default" : "outline"}
                    size="sm"
                    onClick={() => editing ? handleSave() : setEditing(true)}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : editing ? (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {editing ? "Save Changes" : "Edit Profile"}
                  </Button>
                </div>

                {saved && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 rounded-lg border border-profit/20 bg-profit/5 px-3 py-2 text-xs text-profit"
                  >
                    <Check className="mr-1.5 inline h-3.5 w-3.5" /> Profile saved successfully
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Trading stats */}
          <motion.div variants={fadeUp}>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              {[
                { label: "Total Trades", value: profile?.stats.totalTrades.toString() || "0", icon: BarChart3 },
                { label: "Total PnL", value: `${(profile?.stats.totalPnl ?? 0) >= 0 ? "+" : ""}$${(profile?.stats.totalPnl ?? 0).toFixed(2)}`, icon: TrendingUp, positive: (profile?.stats.totalPnl ?? 0) >= 0 },
                { label: "Win Rate", value: `${profile?.stats.winRate ?? 0}%`, icon: Zap },
                { label: "Active Strategies", value: (profile?.stats.activeStrategies ?? 0).toString(), icon: Plug },
              ].map((stat) => (
                <Card key={stat.label} className="border-border/50 bg-card/80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                      <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className={`mt-1 text-lg font-bold ${stat.positive === false ? "text-loss" : stat.positive ? "text-profit" : ""}`}>
                      {stat.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* Profile details form */}
          <motion.div variants={fadeUp}>
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3 w-3" /> Full Name
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!editing}
                      className="mt-1.5 bg-muted/30 disabled:opacity-70"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /> Email
                    </Label>
                    <Input
                      value={profile?.email || ""}
                      disabled
                      className="mt-1.5 bg-muted/30 opacity-60"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3 w-3" /> Display Name
                    </Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      disabled={!editing}
                      className="mt-1.5 bg-muted/30 disabled:opacity-70"
                      placeholder="@username"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> Phone
                    </Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={!editing}
                      className="mt-1.5 bg-muted/30 disabled:opacity-70"
                      placeholder="+91 9876543210"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> Timezone
                    </Label>
                    <Input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      disabled={!editing}
                      className="mt-1.5 bg-muted/30 disabled:opacity-70"
                      placeholder="UTC+5:30"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> Country
                    </Label>
                    <Input
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      disabled={!editing}
                      className="mt-1.5 bg-muted/30 disabled:opacity-70"
                      placeholder="India"
                    />
                  </div>
                </div>

                <div>
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Edit3 className="h-3 w-3" /> Bio
                  </Label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    disabled={!editing}
                    rows={3}
                    className="mt-1.5 w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-70"
                    placeholder="Tell us about yourself..."
                  />
                </div>

                {/* Member info */}
                <Separator />
                <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Member since {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—"}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Plug className="h-3 w-3" />
                    {profile?.stats.activeBrokers ?? 0} broker{(profile?.stats.activeBrokers ?? 0) !== 1 ? "s" : ""} connected
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Last updated {profile?.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ══════════ Alerts Tab ══════════ */}
        <TabsContent value="alerts">
          <motion.div variants={fadeUp} className="space-y-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Notification Channels</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#229ED9]/10">
                      <Send className="h-5 w-5 text-[#229ED9]" />
                    </div>
                    <div>
                      <p className="font-medium">Telegram</p>
                      <p className="text-xs text-muted-foreground">
                        {telegramConnected ? `Connected to @${profile?.displayName || "user"}` : "Get instant alerts on Telegram"}
                      </p>
                    </div>
                  </div>
                  {telegramConnected ? (
                    <Badge className="bg-profit/10 text-profit">
                      <Check className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  ) : (
                    <Button size="sm" onClick={() => setTelegramConnected(true)}>Connect</Button>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Email</p>
                      <p className="text-xs text-muted-foreground">{profile?.email}</p>
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

        {/* ══════════ Security Tab ══════════ */}
        <TabsContent value="security">
          <motion.div variants={fadeUp} className="space-y-4">
            {/* Change password */}
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Change Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile?.hasPassword ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Current Password</Label>
                        <Input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="mt-1.5 bg-muted/30"
                          placeholder="Enter current password"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">New Password</Label>
                        <Input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="mt-1.5 bg-muted/30"
                          placeholder="Minimum 8 characters"
                        />
                      </div>
                    </div>
                    {passwordMsg && (
                      <div className={`rounded-lg border px-3 py-2 text-xs ${passwordMsg.type === "success" ? "border-profit/20 bg-profit/5 text-profit" : "border-loss/20 bg-loss/5 text-loss"}`}>
                        {passwordMsg.text}
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={handlePasswordChange}
                      disabled={!currentPassword || newPassword.length < 8}
                    >
                      Update Password
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You signed up with Google. Set a password to also login with email.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Security settings */}
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
                    <p className="text-sm font-medium">Active Sessions</p>
                    <p className="text-xs text-muted-foreground">Manage devices logged in to your account</p>
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
