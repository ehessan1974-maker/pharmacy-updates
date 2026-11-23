/* db.settings.js — v110: لوحة «إعدادات الاتصال بقاعدة البيانات» + مؤشر الحالة الدائم.
   تعمل على أي صفحة من البرنامج؛ الجسر للخادم عبر /api/db/*. */
(function () {
  'use strict';

  var CSS_DONE = false;
  var pill = null;

  function ensureCss() {
    if (CSS_DONE) return;
    CSS_DONE = true;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/static/db.settings.css';
    document.head.appendChild(l);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* ---------- المؤشر الدائم ---------- */
  function buildPill() {
    if (pill) return pill;
    pill = document.createElement('div');
    pill.id = 'dbStatusPill';
    pill.className = 'dbPill dbPill-loading';
    pill.title = 'حالة قاعدة البيانات — انقر لفتح إعدادات الاتصال';
    pill.addEventListener('click', openPanel);
    document.body.appendChild(pill);
    return pill;
  }

  var _pillBusy = false;
  function refreshPill() {
    /* v111: استقصاء رخيص — تخطَّ التبويب المخفي ولا تكدّس الطلبات */
    if (_pillBusy || (document.visibilityState && document.visibilityState !== 'visible')) return;
    _pillBusy = true;
    fetch('/api/db/status').then(function (r) { return r.json(); }).then(function (d) {
      _pillBusy = false;
      var p = buildPill();
      var m = d.meta || {};
      var name = (m.path || m.connection_string || '').split(/[\\/]/).pop() || '—';
      var kindLabel = m.label || m.kind || '؟';
      if (d.status === 'connected') {
        p.className = 'dbPill ' + (d.read_only ? 'dbPill-ro' : 'dbPill-ok');
        p.innerHTML = '<b>' + esc(kindLabel) + '</b><span>' + esc(name) +
          (d.read_only ? ' • قراءة فقط' : ' • متصل ✓') +
          (d.missing && d.missing.length ? ' • جداول ناقصة: ' + d.missing.length : '') + '</span>';
      } else if (d.status === 'idle') {
        p.className = 'dbPill dbPill-idle';
        p.innerHTML = '<b>' + esc(kindLabel) + '</b><span>' + esc(name) + ' • جاهز — الفحص عند الطلب</span>';
      } else {
        p.className = 'dbPill dbPill-err';
        p.innerHTML = '<b>قاعدة البيانات</b><span>انقر للإعدادات والفحص</span>';
      }
    }).catch(function () {
      _pillBusy = false;
      var p = buildPill();
      p.className = 'dbPill dbPill-err';
      p.innerHTML = '<b>قاعدة البيانات</b><span>انقر للإعدادات</span>';
    });
  }

  /* ---------- اللوحة ---------- */
  var panelEl = null;

  function closePanel() {
    if (panelEl) { panelEl.remove(); panelEl = null; }
  }

  function fieldRow(label, inputHtml) {
    return '<div class="dbRow"><label>' + label + '</label>' + inputHtml + '</div>';
  }

  function openPanel() {
    ensureCss();
    closePanel();
    fetch('/api/db/kinds').then(function (r) { return r.json(); }).then(function (d) {
      buildPanel(d);
    }).catch(function (e) {
      alert('تعذر تحميل إعدادات قاعدة البيانات: ' + e);
    });
  }

  function buildPanel(d) {
    var kinds = d.kinds || [];
    var cur = d.current || {};
    var meta = d.meta || {};
    var kindOpts = kinds.map(function (k) {
      return '<option value="' + esc(k.kind) + '"' + (k.kind === cur.kind ? ' selected' : '') + '>' + esc(k.label) + '</option>';
    }).join('');
    var el = document.createElement('div');
    el.className = 'dbPanel';
    el.innerHTML =
      '<div class="dbHead"><b>إعدادات الاتصال بقاعدة البيانات</b>' +
      '<button type="button" class="dbClose">✖</button></div>' +
      '<div class="dbBody">' +
      '<div class="dbNow">المصدر الحالي: <b>' + esc(meta.label || meta.kind || '؟') + '</b>' +
      (meta.path ? ' — ' + esc(meta.path) : '') +
      (meta.read_only ? ' (قراءة فقط)' : '') + '</div>' +
      fieldRow('نوع قاعدة البيانات', '<select id="dbKindSel">' + kindOpts + '</select>') +
      fieldRow('مسار الملف/المجلد (على جهاز الخادم)',
        '<input id="dbPathIn" type="text" placeholder="مثال: data/pharmacy.db أو E:\\قاعدة\\MDB_be.accdb أو مجلد TXT/CSV" value="' + esc(cur.path || '') + '">') +
      fieldRow('رابط الاتصال (للأنواع الشبكية فقط)',
        '<input id="dbCsIn" type="text" placeholder="postgresql://user:pass@host:5432/dbname" value="' + esc(cur.connection_string || '') + '">') +
      '<div class="dbRow dbRowInline"><label><input id="dbRoIn" type="checkbox"' + (cur.read_only ? ' checked' : '') + '> القراءة فقط (Read-Only)</label>' +
      '<label><input id="dbCreateIn" type="checkbox" checked> إنشاء الجداول الناقصة تلقائيًا</label></div>' +
      '<div id="dbTestOut" class="dbTestOut"></div>' +
      '<div class="dbActions">' +
      '<button type="button" id="dbTestBtn" class="dbBtn dbBtn2">🔎 اختبار الاتصال وفحص الجداول</button>' +
      '<button type="button" id="dbSaveBtn" class="dbBtn dbBtn1">💾 حفظ وتفعيل فورًا</button>' +
      '<button type="button" id="dbBackupBtn" class="dbBtn dbBtn2">🛡️ نسخة احتياطية الآن</button>' +
      '</div>' +
      '<hr class="dbSep">' +
      '<div class="dbMigTitle">نقل/نسخ البيانات من القاعدة الحالية إلى قاعدة أخرى</div>' +
      '<select id="dbMigKind">' + kindOpts + '</select>' +
      fieldRow('مسار القاعدة الهدف', '<input id="dbMigPath" type="text" placeholder="مجلد أو ملف القاعدة الهدف">') +
      fieldRow('رابط الاتصال للهدف (شبكية)', '<input id="dbMigCs" type="text">') +
      '<div class="dbActions">' +
      '<button type="button" id="dbMigBtn" class="dbBtn dbBtn1">🚚 ابدأ الترحيل</button>' +
      '<button type="button" id="dbMigRefreshBtn" class="dbBtn dbBtn2">↻ تحديث من القاعدة الأصلية (الجسر)</button>' +
      '</div>' +
      '<div id="dbMigBar" class="dbMigBar" style="display:none"><div class="dbMigFill"></div><span class="dbMigTxt"></span></div>' +
      '<div id="dbMigOut" class="dbTestOut"></div>' +
      '</div>';
    document.body.appendChild(el);
    panelEl = el;

    el.querySelector('.dbClose').addEventListener('click', closePanel);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
    el.querySelector('#dbKindSel').addEventListener('change', function () {
      var k = this.value;
      el.querySelector('#dbPathIn').closest('.dbRow').style.display = (k === 'network' || k === 'access-sim') ? 'none' : '';
      el.querySelector('#dbCsIn').closest('.dbRow').style.display = k === 'network' ? '' : 'none';
    });
    el.querySelector('#dbKindSel').dispatchEvent(new Event('change'));

    function collect() {
      return {
        kind: el.querySelector('#dbKindSel').value,
        path: el.querySelector('#dbPathIn').value.trim(),
        connection_string: el.querySelector('#dbCsIn').value.trim(),
        read_only: el.querySelector('#dbRoIn').checked,
        create_missing: el.querySelector('#dbCreateIn').checked
      };
    }

    el.querySelector('#dbTestBtn').addEventListener('click', function () {
      var out = el.querySelector('#dbTestOut');
      out.innerHTML = '<span class="dbWarn">جارٍ الاختبار…</span>';
      fetch('/api/db/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collect())
      }).then(function (r) { return r.json(); }).then(function (r) {
        if (r.error) { out.innerHTML = '<span class="dbErr">✖ ' + esc(r.error) + '</span>'; return; }
        var html = '<span class="dbOk">✓ الاتصال ناجح — الجداول: ' + (r.tables || []).length + '</span>';
        if (r.created && r.created.length) html += '<br><span class="dbOk">أُنشئت: ' + esc(r.created.join('، ')) + '</span>';
        if (r.missing && r.missing.length) html += '<br><span class="dbWarn">ناقصة: ' + esc(r.missing.join('، ')) + '</span>' + (r.note ? '<br>' + esc(r.note) : '');
        else if (!r.note) html += '<br><span class="dbOk">كل الجداول المطلوبة موجودة ✓</span>';
        html += '<details><summary>قائمة الجداول</summary><div class="dbTables">' +
          (r.tables || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div></details>';
        out.innerHTML = html;
      }).catch(function (e) { out.innerHTML = '<span class="dbErr">✖ ' + esc(String(e)) + '</span>'; });
    });

    el.querySelector('#dbSaveBtn').addEventListener('click', function () {
      var out = el.querySelector('#dbTestOut');
      out.innerHTML = '<span class="dbWarn">جارٍ التفعيل…</span>';
      fetch('/api/db/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collect())
      }).then(function (r) { return r.json(); }).then(function (r) {
        if (r.error) { out.innerHTML = '<span class="dbErr">✖ ' + esc(r.error) + '</span>'; return; }
        out.innerHTML = '<span class="dbOk">✓ تم التفعيل: ' + esc((r.meta || {}).label || '') + '</span>';
        refreshPill();
        setTimeout(function () { window.location.reload(); }, 900);
      }).catch(function (e) { out.innerHTML = '<span class="dbErr">✖ ' + esc(String(e)) + '</span>'; });
    });

    el.querySelector('#dbBackupBtn').addEventListener('click', function () {
      var out = el.querySelector('#dbTestOut');
      fetch('/api/db/backup', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (r) {
        out.innerHTML = r.error ? '<span class="dbErr">✖ ' + esc(r.error) + '</span>'
          : '<span class="dbOk">🛡️ نسخة احتياطية: ' + esc(r.dir) + ' (' + (r.files || []).length + ' ملف)</span>';
      });
    });

    /* الترحيل */
    el.querySelector('#dbMigBtn').addEventListener('click', function () {
      var out = el.querySelector('#dbMigOut');
      var bar = el.querySelector('#dbMigBar');
      var fill = el.querySelector('.dbMigFill');
      var txt = el.querySelector('.dbMigTxt');
      var payload = {
        target: {
          kind: el.querySelector('#dbMigKind').value,
          path: el.querySelector('#dbMigPath').value.trim(),
          connection_string: el.querySelector('#dbMigCs').value.trim()
        },
        backup: true
      };
      out.innerHTML = '<span class="dbWarn">بدأ الترحيل…</span>';
      bar.style.display = 'block'; fill.style.width = '2%';
      fetch('/api/db/migrate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); }).then(function (r) {
        if (r.error) { out.innerHTML = '<span class="dbErr">✖ ' + esc(r.error) + '</span>'; return; }
        var poll = setInterval(function () {
          fetch('/api/db/migrate/progress?job=' + r.job).then(function (x) { return x.json(); }).then(function (p) {
            if (p.error) { clearInterval(poll); out.innerHTML = '<span class="dbErr">✖ ' + esc(p.error) + '</span>'; return; }
            var pct = p.total ? Math.round(p.done / p.total * 100) : 2;
            fill.style.width = pct + '%';
            txt.textContent = 'الجدول: ' + (p.table || '…') + ' — ' + p.done + '/' + p.total + ' (' + pct + '%)';
            if (p.status === 'done') {
              clearInterval(poll);
              var okT = (p.result.tables || []).filter(function (t) { return t.verified; }).length;
              out.innerHTML = '<span class="dbOk">✓ اكتمل الترحيل: ' + okT + ' جدولًا مطابقًا من ' + p.result.total +
                (p.result.backup ? ' — نسخة احتياطية: ' + esc(p.result.backup.dir) : '') + '</span>' +
                '<br><span class="dbWarn">لتفعيل القاعدة الجديدة اخترها أعلاه ثم «حفظ وتفعيل فورًا».</span>';
            }
            if (p.status === 'error') {
              clearInterval(poll);
              out.innerHTML = '<span class="dbErr">✖ فشل الترحيل: ' + esc(p.error) + '</span>';
            }
          });
        }, 500);
      }).catch(function (e) { out.innerHTML = '<span class="dbErr">✖ ' + esc(String(e)) + '</span>'; });
    });

    /* تحديث محلي من الجسر (نفس تدفق phRefreshStale) */
    el.querySelector('#dbMigRefreshBtn').addEventListener('click', function () {
      var out = el.querySelector('#dbMigOut');
      if (typeof window.PHSYS_HOST === 'undefined' || !window.PHSYS_HOST) {
        out.innerHTML = '<span class="dbWarn">هذه الوظيفة تعمل داخل نظام فاتورة المبيعات المدمج (Apotheca.html).</span>';
        return;
      }
      if (typeof phRefreshStale === 'function') { phRefreshStale(); out.innerHTML = '<span class="dbOk">أُرسل طلب التحديث من الجسر ✓</span>'; }
    });
  }

  /* ---------- الإقلاع ---------- */
  function boot() {
    ensureCss();
    buildPill();
    refreshPill();
    setInterval(refreshPill, 60000);   /* v111: 60 ث بدل 30 — مؤشر لا يثقل الخادم */
    /* مدخل في القائمة الجانبية إن وُجدت (الشريط الجانبي) */
    var menu = document.getElementById('invoiceSidebarMenu');
    if (menu && !menu.querySelector('#dbSettingsSidebarBtn')) {
      var b = document.createElement('button');
      b.id = 'dbSettingsSidebarBtn';
      b.textContent = '🗄️ إعدادات قاعدة البيانات';
      b.addEventListener('click', function () {
        var sb = document.getElementById('sidebar');
        if (sb) sb.classList.remove('open');
        openPanel();
      });
      menu.appendChild(b);
    }
    /* زر عائم للفتح من أي شاشة */
    if (!document.getElementById('dbSettingsFab')) {
      var fab = document.createElement('button');
      fab.id = 'dbSettingsFab';
      fab.className = 'dbFab';
      fab.title = 'إعدادات الاتصال بقاعدة البيانات';
      fab.textContent = '🗄️';
      fab.addEventListener('click', openPanel);
      document.body.appendChild(fab);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
