package com.alton.phone;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.os.Handler;
import android.os.Looper;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Random;

/**
 * Alton's live wallpaper: the user's own picture, with a small spinning data cloud (or gold data
 * sphere) and a compact clock where they choose. Only animates while it is on screen.
 */
public class AltonWallpaper extends WallpaperService {

    static final String PREFS = "alton_wallpaper";

    static File imageFile(Context ctx) {
        return new File(ctx.getFilesDir(), "wallpaper.jpg");
    }

    @Override
    public Engine onCreateEngine() {
        return new Eng();
    }

    private class Eng extends Engine {
        private final Handler h = new Handler(Looper.getMainLooper());
        private final Runnable tick = this::frame;
        private boolean visible = false;
        private int w = 1;
        private int ht = 1;
        private Bitmap bg;
        private long bgStamp = -1;
        private final int arcs = 26;
        private final float[][] axis = new float[arcs][6]; // u (3) and v (3) for each arc
        private final float[] start = new float[arcs];
        private final float[] len = new float[arcs];
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint shade = new Paint();
        private final Path path = new Path();
        private final long born = System.currentTimeMillis();
        // settings
        private String position = "top-right";
        private String variant = "cloud";
        private float scale = 1f;
        private boolean clock = true;
        private boolean lockOnly = true;
        private int frameMs = 33;

        Eng() {
            Random r = new Random(7);
            for (int i = 0; i < arcs; i++) {
                float[] n = unit(r);
                float[] a = Math.abs(n[0]) < 0.9f ? new float[] { 1, 0, 0 } : new float[] { 0, 1, 0 };
                float[] u = norm(cross(n, a));
                float[] v = cross(n, u);
                axis[i] = new float[] { u[0], u[1], u[2], v[0], v[1], v[2] };
                start[i] = (float) (r.nextFloat() * Math.PI * 2);
                len[i] = 1.2f + r.nextFloat() * 2.2f;
            }
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeCap(Paint.Cap.ROUND);
            glow.setStyle(Paint.Style.FILL);
            text.setTextAlign(Paint.Align.CENTER);
            text.setFakeBoldText(true);
        }

        @Override
        public void onVisibilityChanged(boolean v) {
            visible = v;
            h.removeCallbacks(tick);
            if (v) {
                loadPrefs();
                h.post(tick);
            }
        }

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            w = width;
            ht = height;
            bgStamp = -1;
            h.removeCallbacks(tick);
            h.post(tick);
        }

        @Override
        public void onSurfaceDestroyed(SurfaceHolder holder) {
            visible = false;
            h.removeCallbacks(tick);
            super.onSurfaceDestroyed(holder);
        }

        private void loadPrefs() {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            position = p.getString("position", "shortcuts");
            variant = p.getString("variant", "sphere");
            scale = "medium".equals(p.getString("size", "small")) ? 1.5f : 1f;
            clock = p.getBoolean("clock", false);
            lockOnly = p.getBoolean("lockOnly", true);
            frameMs = p.getBoolean("calm", false) ? 66 : 33;
        }

        private void loadBg() {
            File f = imageFile(AltonWallpaper.this);
            long stamp = f.exists() ? f.lastModified() : 0;
            if (stamp == bgStamp) return;
            bgStamp = stamp;
            bg = null;
            if (stamp == 0) return;
            try {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(f.getPath(), o);
                int sample = 1;
                while (o.outWidth / (sample * 2) >= w && o.outHeight / (sample * 2) >= ht) sample *= 2;
                o = new BitmapFactory.Options();
                o.inSampleSize = sample;
                bg = BitmapFactory.decodeFile(f.getPath(), o);
            } catch (Exception ignored) {
                bg = null;
            }
        }

        private void frame() {
            SurfaceHolder sh = getSurfaceHolder();
            Canvas c = null;
            try {
                c = sh.lockCanvas();
                if (c != null) draw(c);
            } catch (Exception ignored) {
            } finally {
                if (c != null) {
                    try {
                        sh.unlockCanvasAndPost(c);
                    } catch (Exception ignored) {}
                }
            }
            h.removeCallbacks(tick);
            if (visible) h.postDelayed(tick, frameMs);
        }

        private void draw(Canvas c) {
            loadBg();
            // The picture, filling the screen (centre crop), or Alton's dark blue.
            if (bg != null) {
                float k = Math.max((float) w / bg.getWidth(), (float) ht / bg.getHeight());
                int sw = Math.round(w / k);
                int sh2 = Math.round(ht / k);
                int sx = (bg.getWidth() - sw) / 2;
                int sy = (bg.getHeight() - sh2) / 2;
                c.drawBitmap(bg, new Rect(sx, sy, sx + sw, sy + sh2), new Rect(0, 0, w, ht), null);
            } else {
                shade.setShader(new LinearGradient(0, 0, 0, ht, Color.rgb(6, 16, 28), Color.rgb(2, 5, 10), Shader.TileMode.CLAMP));
                c.drawRect(0, 0, w, ht, shade);
            }
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (lockOnly && km != null && !km.isKeyguardLocked()) return;
            float d = getResources().getDisplayMetrics().density;
            boolean shortcuts = "shortcuts".equals(position);
            float R = (shortcuts ? 21 : 44) * d * scale;
            float cx;
            float cy;
            switch (position) {
                case "top-left":
                    cx = R + 28 * d;
                    cy = ht * 0.17f;
                    break;
                case "top-middle":
                    cx = w / 2f;
                    cy = ht * 0.5f;
                    break;
                case "shortcuts": // centred, in line with the lock screen's call and camera buttons
                    cx = w / 2f;
                    cy = ht * 0.934f;
                    break;
                case "bottom":
                    cx = w / 2f;
                    cy = ht * 0.70f;
                    break;
                default:
                    cx = w - R - 28 * d;
                    cy = ht * 0.17f;
            }
            float t = (System.currentTimeMillis() - born) / 1000f;
            boolean gold = "sphere".equals(variant);
            int cr = gold ? 232 : 90;
            int cg = gold ? 196 : 180;
            int cb = gold ? 120 : 255;
            // Soft glow behind it.
            glow.setShader(new RadialGradient(cx, cy, R * 1.5f, Color.argb(gold ? 70 : 80, cr, cg, cb), Color.TRANSPARENT, Shader.TileMode.CLAMP));
            c.drawCircle(cx, cy, R * 1.5f, glow);
            double ry = t * 0.35;
            double rx = 0.42;
            float cosY = (float) Math.cos(ry);
            float sinY = (float) Math.sin(ry);
            float cosX = (float) Math.cos(rx);
            float sinX = (float) Math.sin(rx);
            int count = gold ? 18 : arcs;
            for (int i = 0; i < count; i++) {
                float[] a = axis[i];
                path.reset();
                float depth = 0;
                int steps = 22;
                for (int k = 0; k <= steps; k++) {
                    // The gold sphere: whole rings (a neat wireframe globe); the cloud: lumpy arcs.
                    float th = gold
                        ? (float) (Math.PI * 2 * k / steps)
                        : start[i] + len[i] * k / steps + t * 0.15f * ((i % 2) * 2 - 1);
                    float co = (float) Math.cos(th);
                    float si = (float) Math.sin(th);
                    float x = a[0] * co + a[3] * si;
                    float y = a[1] * co + a[4] * si;
                    float z = a[2] * co + a[5] * si;
                    float lump = gold ? 1f : 1f + 0.16f * (float) Math.sin(3 * th + t * 0.8f + i);
                    // turn it: around Y, then tilt around X
                    float x1 = x * cosY + z * sinY;
                    float z1 = -x * sinY + z * cosY;
                    float y1 = y * cosX - z1 * sinX;
                    float z2 = y * sinX + z1 * cosX;
                    depth += z2;
                    float px = cx + x1 * R * lump;
                    float py = cy + y1 * R * lump;
                    if (k == 0) path.moveTo(px, py);
                    else path.lineTo(px, py);
                }
                float front = (depth / (steps + 1) + 1) / 2; // 0 back … 1 front
                int alpha = Math.round(50 + 190 * front);
                line.setStrokeWidth((gold ? 0.6f + 0.5f * front : 0.8f + 1.2f * front) * d * (scale > 1 ? 1.2f : 1f));
                line.setColor(
                    gold ? Color.argb(alpha, cr, cg, cb) : Color.argb(alpha, Math.min(255, cr + 60), Math.min(255, cg + 40), cb)
                );
                c.drawPath(path, line);
            }
            glow.setShader(new RadialGradient(cx, cy, R * 0.35f, Color.argb(220, 235, 248, 255), Color.TRANSPARENT, Shader.TileMode.CLAMP));
            c.drawCircle(cx, cy, R * 0.35f, glow);
            if (clock && !shortcuts) {
                Date now = new Date();
                text.setColor(Color.rgb(230, 246, 255));
                text.setShadowLayer(10 * d, 0, 0, Color.rgb(63, 208, 255));
                text.setTextSize(24 * d * (scale > 1 ? 1.25f : 1f));
                float ty = cy + R * 1.25f + 22 * d;
                c.drawText(new SimpleDateFormat("HH:mm", Locale.UK).format(now), cx, ty, text);
                text.setShadowLayer(0, 0, 0, 0);
                text.setColor(Color.rgb(63, 208, 255));
                text.setTextSize(11 * d * (scale > 1 ? 1.2f : 1f));
                c.drawText(new SimpleDateFormat("EEE d MMM", Locale.UK).format(now).toUpperCase(Locale.UK), cx, ty + 16 * d, text);
            }
        }
    }

    private static float[] unit(Random r) {
        float x = r.nextFloat() * 2 - 1;
        float y = r.nextFloat() * 2 - 1;
        float z = r.nextFloat() * 2 - 1;
        return norm(new float[] { x, y, z });
    }

    private static float[] cross(float[] a, float[] b) {
        return new float[] { a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0] };
    }

    private static float[] norm(float[] a) {
        float l = (float) Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
        if (l < 1e-6f) return new float[] { 0, 0, 1 };
        return new float[] { a[0] / l, a[1] / l, a[2] / l };
    }
}
