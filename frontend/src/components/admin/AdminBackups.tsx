import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import apiClient from '@/api/client'
import type { BackupInfo, BackupStatus } from '@/types'
import {
  HardDrive,
  Download,
  Trash2,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Usb,
  Loader2,
} from 'lucide-react'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`
}

function formatWhen(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  if (!iso) return 'لم تُؤخذ أي نسخة بعد'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'لم تُؤخذ أي نسخة بعد'
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} ساعة`
  return `منذ ${Math.floor(hours / 24)} يوم`
}

export function AdminBackups() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<BackupInfo | null>(null)

  // Draft copies of the editable fields. Kept out of the query cache so typing
  // in the path box is not wiped by a background refetch.
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [intervalHours, setIntervalHours] = useState('6')
  const [retentionDays, setRetentionDays] = useState('30')
  const [externalPath, setExternalPath] = useState('')
  const [touched, setTouched] = useState(false)

  const { data: status } = useQuery({
    queryKey: ['backup-settings'],
    // `?? null` is load-bearing: TanStack Query treats an undefined result as a
    // failure and keeps serving the previous value.
    queryFn: () => apiClient.getBackupSettings().then((r) => r.data ?? null),
    refetchInterval: 60_000,
  })

  const { data: backups } = useQuery({
    queryKey: ['backups'],
    queryFn: () => apiClient.getBackups().then((r) => r.data ?? []),
    refetchInterval: 60_000,
  })

  // Adopt server values once, and again whenever the user has no unsaved edits.
  useEffect(() => {
    if (!status || touched) return
    setAutoEnabled(status.auto_enabled)
    setIntervalHours(String(status.interval_hours))
    setRetentionDays(String(status.retention_days))
    setExternalPath(status.external_path ?? '')
  }, [status, touched])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['backups'] })
    queryClient.invalidateQueries({ queryKey: ['backup-settings'] })
  }

  const createMutation = useMutation({
    mutationFn: () => apiClient.createBackup(),
    onSuccess: (res) => {
      invalidate()
      toast({
        title: res.message,
        description: res.data ? `${res.data.info.name} — ${formatSize(res.data.info.size_bytes)}` : undefined,
        variant: res.data?.external_error ? 'destructive' : undefined,
      })
    },
    onError: (e: any) => toast({ title: 'فشلت النسخة الاحتياطية', description: e.message, variant: 'destructive' }),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.updateBackupSettings({
        auto_enabled: autoEnabled,
        interval_hours: Number(intervalHours) || 6,
        retention_days: Number(retentionDays) || 30,
        external_path: externalPath.trim(),
      }),
    onSuccess: () => {
      setTouched(false)
      invalidate()
      toast({ title: 'تم حفظ إعدادات النسخ الاحتياطي' })
    },
    onError: (e: any) => toast({ title: 'تعذّر الحفظ', description: e.message, variant: 'destructive' }),
  })

  const restoreMutation = useMutation({
    mutationFn: (name: string) => apiClient.restoreBackup(name),
    onSuccess: (res) => {
      setConfirming(null)
      invalidate()
      toast({ title: res.message, description: `نسخة الأمان قبل الاسترجاع: ${res.data?.safety_backup ?? '—'}` })
    },
    onError: (e: any) => {
      setConfirming(null)
      toast({ title: 'فشل الاسترجاع', description: e.message, variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => apiClient.deleteBackup(name),
    onSuccess: () => {
      invalidate()
      toast({ title: 'تم حذف النسخة' })
    },
    onError: (e: any) => toast({ title: 'تعذّر الحذف', description: e.message, variant: 'destructive' }),
  })

  const handleDownload = async (name: string) => {
    try {
      const blob = await apiClient.downloadBackup(name)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ title: 'تعذّر تنزيل النسخة', description: e.message, variant: 'destructive' })
    }
  }

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setTouched(true)
    setter(v)
  }

  const list: BackupInfo[] = Array.isArray(backups) ? backups : []
  const s: BackupStatus | null = status ?? null

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">النسخ الاحتياطي</h2>
          <p className="text-muted-foreground">حماية طلبات مطعمك ومبيعاته من الضياع</p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !s?.tools_found}>
          {createMutation.isPending ? (
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
          ) : (
            <HardDrive className="w-4 h-4 ml-2" />
          )}
          {createMutation.isPending ? 'جاري النسخ...' : 'خذ نسخة الآن'}
        </Button>
      </div>

      {/* pg_dump missing: nothing on this screen can work. Say so first. */}
      {s && !s.tools_found && (
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 pt-6">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">النسخ الاحتياطي معطّل</p>
              <p className="text-sm text-muted-foreground">
                لم يعثر البرنامج على أدوات قاعدة البيانات (pg_dump). لن تعمل أي نسخة احتياطية حتى تُضبط.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* The single most important warning in this program. */}
      {s?.tools_found && !s.external_path && (
        <Card className="border-amber-500">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-700">النسخ كلها على نفس الجهاز</p>
              <p className="text-sm text-muted-foreground">
                لو تلف قرص هذا الجهاز، تضيع قاعدة البيانات <b>والنسخ الاحتياطية معاً</b> — أقسام القرص
                (C: و D:) في معظم الأجهزة قرص واحد. حدّد مكاناً خارجياً بالأسفل: فلاشة، أو هارد خارجي،
                أو مجلد على جهاز آخر في الشبكة.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {s?.external_path && !s.external_ok && (
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 pt-6">
            <Usb className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">المكان الخارجي غير متاح الآن</p>
              <p className="text-sm text-muted-foreground">
                {s.external_path} — تأكّد أن الفلاشة موصولة. النسخ تُحفظ محلياً فقط حتى تعود.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current state */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            الحالة
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">آخر نسخة احتياطية</p>
            <p className="font-semibold">{timeAgo(s?.last_at ?? '')}</p>
            {s?.last_at && <p className="text-xs text-muted-foreground">{formatWhen(s.last_at)}</p>}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">نتيجة آخر محاولة</p>
            {s?.last_status === 'ok' ? (
              <p className="font-semibold text-green-600 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> نجحت
              </p>
            ) : s?.last_status ? (
              <p className="font-semibold text-destructive text-sm">{s.last_status}</p>
            ) : (
              <p className="font-semibold text-muted-foreground">—</p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">النسخ التلقائي</p>
            <p className="font-semibold">
              {s?.auto_enabled ? `كل ${s.interval_hours} ساعة` : 'مُطفأ'}
            </p>
          </div>
          <div className="md:col-span-3">
            <p className="text-sm text-muted-foreground">تُحفظ النسخ في</p>
            <p className="font-mono text-xs break-all">{s?.backup_dir ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>الإعدادات</CardTitle>
          <CardDescription>متى تُؤخذ النسخة، وأين تُحفظ نسخة ثانية</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">نسخ احتياطي تلقائي</p>
              <p className="text-sm text-muted-foreground">
                يعمل ما دام البرنامج شغّالاً. لو كان الجهاز مطفأ وقت الموعد، تُؤخذ النسخة بعد تشغيله مباشرة.
              </p>
            </div>
            <Switch checked={autoEnabled} onCheckedChange={edit(setAutoEnabled)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-2 block">كل كام ساعة؟</label>
              <Input
                type="number"
                min={1}
                max={168}
                value={intervalHours}
                onChange={(e) => edit(setIntervalHours)(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">احتفظ بالنسخ كام يوم؟</label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={retentionDays}
                onChange={(e) => edit(setRetentionDays)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                النسخ الأقدم من ذلك تُحذف تلقائياً. نسخ الأمان (قبل أي استرجاع) لا تُحذف أبداً.
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">مكان النسخة الثانية (خارج الجهاز)</label>
            <Input
              dir="ltr"
              className="text-start font-mono"
              placeholder="E:\pos-backups"
              value={externalPath}
              onChange={(e) => edit(setExternalPath)(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              اكتب مسار فلاشة أو هارد خارجي أو مجلد مشترك على الشبكة. يُختبر عند الحفظ: لو تعذّرت الكتابة
              فيه، لن يُقبل. اتركه فارغاً لتعطيل النسخة الثانية.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !touched}>
              <Save className="w-4 h-4 ml-2" />
              {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* The dumps themselves */}
      <Card>
        <CardHeader>
          <CardTitle>النسخ المحفوظة</CardTitle>
          <CardDescription>{list.length} نسخة على هذا الجهاز</CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              لا توجد نسخ بعد. اضغط «خذ نسخة الآن».
            </p>
          ) : (
            <div className="space-y-2">
              {list.map((b) => (
                <div
                  key={b.name}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm truncate">{b.name}</span>
                      {b.kind === 'safety' && <Badge variant="secondary">نسخة أمان</Badge>}
                      {b.on_external && (
                        <Badge variant="outline" className="text-green-700 border-green-600">
                          <Usb className="w-3 h-3 ml-1" />
                          نسخة خارجية
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(b.created_at)} · {formatSize(b.size_bytes)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDownload(b.name)}>
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirming(b)}>
                      <RotateCcw className="w-4 h-4 ml-1" />
                      استرجاع
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(b.name)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore is the one irreversible button here. Make the cost explicit. */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                تأكيد الاسترجاع
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                سيُستبدل كل ما في النظام الآن — الطلبات والمبيعات والمخزون والورديات — بمحتوى النسخة:
              </p>
              <p className="font-mono text-sm bg-muted p-2 rounded break-all">{confirming.name}</p>
              <p className="text-sm text-muted-foreground">
                أي طلب أو دفعة سُجّلت بعد <b>{formatWhen(confirming.created_at)}</b> ستختفي.
              </p>
              <p className="text-sm text-muted-foreground">
                سيأخذ البرنامج نسخة أمان من الوضع الحالي أولاً، فيمكن التراجع. أغلق البرنامج على باقي
                الأجهزة قبل المتابعة.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirming(null)} disabled={restoreMutation.isPending}>
                  إلغاء
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => restoreMutation.mutate(confirming.name)}
                  disabled={restoreMutation.isPending}
                >
                  {restoreMutation.isPending ? (
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 ml-2" />
                  )}
                  {restoreMutation.isPending ? 'جاري الاسترجاع...' : 'نعم، استرجع هذه النسخة'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
