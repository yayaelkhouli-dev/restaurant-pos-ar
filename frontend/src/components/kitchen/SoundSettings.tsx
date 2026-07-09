import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Volume2, VolumeX, TestTube } from 'lucide-react';
import { kitchenSoundService, type SoundSettings, type SoundEvent } from '@/services/soundService';
import { cn } from '@/lib/utils';

interface SoundSettingsProps {
  className?: string;
  onClose?: () => void;
}

export function SoundSettings({ className, onClose }: SoundSettingsProps) {
  const [settings, setSettings] = useState<SoundSettings>(kitchenSoundService.getSettings());
  const [isTestingSound, setIsTestingSound] = useState<string | null>(null);

  useEffect(() => {
    // Load current settings when component mounts
    setSettings(kitchenSoundService.getSettings());
  }, []);

  const handleSettingChange = (key: keyof SoundSettings, value: boolean | number) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    kitchenSoundService.updateSettings({ [key]: value });
  };

  const handleVolumeChange = (value: number[]) => {
    const volume = value[0];
    handleSettingChange('volume', volume);
  };

  const testSound = async (type: SoundEvent['type']) => {
    if (isTestingSound) return;
    
    setIsTestingSound(type);
    try {
      await kitchenSoundService.testSound(type);
    } catch (error) {
      console.error('Failed to test sound:', error);
    } finally {
      setTimeout(() => setIsTestingSound(null), 1000);
    }
  };

  const soundTests = [
    {
      type: 'new_order' as const,
      label: 'تنبيه طلب جديد',
      description: 'يصدر عند استلام طلب جديد',
      icon: '🆕',
    },
    {
      type: 'order_ready' as const,
      label: 'تنبيه جاهزية الطلب',
      description: 'يصدر عندما يصبح الطلب جاهزاً للاستلام',
      icon: '✅',
    },
    {
      type: 'takeaway_ready' as const,
      label: 'تنبيه جاهزية التيك أواي',
      description: 'يصدر عندما يصبح طلب التيك أواي جاهزاً',
      icon: '📦',
    },
  ];

  return (
    <Card className={cn("w-full max-w-md", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          إعدادات الصوت
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Sound Control */}
        <div className="flex items-center justify-between space-x-2">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">تفعيل الأصوات</Label>
            <p className="text-sm text-muted-foreground">
              تشغيل/إيقاف جميع إشعارات المطبخ (لا يتطلب الوصول إلى الميكروفون)
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
          />
        </div>

        {/* Volume Control */}
        <div className="space-y-2">
          <Label className="text-base font-medium flex items-center gap-2">
            {settings.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            مستوى الصوت: {Math.round(settings.volume * 100)}%
          </Label>
          <Slider
            value={[settings.volume]}
            onValueChange={handleVolumeChange}
            max={1}
            min={0}
            step={0.1}
            disabled={!settings.enabled}
            className="w-full"
          />
        </div>

        {/* Individual Sound Controls */}
        <div className="space-y-4">
          <Label className="text-base font-medium">أنواع الأصوات</Label>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">الطلبات الجديدة</Label>
                <p className="text-xs text-muted-foreground">
                  تنبيه عند وصول طلبات جديدة
                </p>
              </div>
              <Switch
                checked={settings.newOrderEnabled && settings.enabled}
                onCheckedChange={(checked) => handleSettingChange('newOrderEnabled', checked)}
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">جاهزية الطلب</Label>
                <p className="text-xs text-muted-foreground">
                  تنبيه عندما تصبح الطلبات جاهزة
                </p>
              </div>
              <Switch
                checked={settings.orderReadyEnabled && settings.enabled}
                onCheckedChange={(checked) => handleSettingChange('orderReadyEnabled', checked)}
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">جاهزية التيك أواي</Label>
                <p className="text-xs text-muted-foreground">
                  تنبيه عندما تصبح طلبات التيك أواي جاهزة
                </p>
              </div>
              <Switch
                checked={settings.takeawayReadyEnabled && settings.enabled}
                onCheckedChange={(checked) => handleSettingChange('takeawayReadyEnabled', checked)}
                disabled={!settings.enabled}
              />
            </div>
          </div>
        </div>

        {/* Sound Test Section */}
        <div className="space-y-3">
          <Label className="text-base font-medium">اختبار الأصوات</Label>
          <div className="grid gap-2">
            {soundTests.map((sound) => (
              <Button
                key={sound.type}
                variant="outline"
                size="sm"
                onClick={() => testSound(sound.type)}
                disabled={!settings.enabled || isTestingSound !== null}
                className="justify-start h-auto p-3"
              >
                <div className="flex items-center gap-3 w-full">
                  <span className="text-lg">{sound.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-sm">{sound.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {sound.description}
                    </div>
                  </div>
                  {isTestingSound === sound.type ? (
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4" />
                  )}
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        {onClose && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={onClose} variant="outline">
              تم
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
