/*
 * timeline.js - シンプルな年表（ガントチャート風）描画エンジン
 *
 * gantt-chart-diary (https://github.com/shushushu-san/gantt-chart-diary) の
 * GanttChart コンポーネントの考え方（水平線＋イベントマーカー／期間バー、
 * ホバーでツールチップ、表示範囲をデータから動的計算）を、
 * 依存ライブラリなしの静的HTML向けに「年スケール」へ移植したもの。
 *
 * 使い方:
 *   renderTimeline('#timeline', {
 *     events: [
 *       { title: 'モリスワーム', category: 'マルウェア', start: 1988, summary: '...' },
 *       { title: 'フリーキング全盛期', category: '黎明期', start: 1970, end: 1983 },
 *     ],
 *     categories: ['黎明期', 'マルウェア'], // 任意: 行の表示順
 *   });
 */
(function (global) {
    'use strict';

    // カテゴリ名から決定論的に色を生成するためのパレット
    var PALETTE = [
        '#dc3545', '#6366f1', '#10b981', '#f59e0b', '#ec4899',
        '#3b82f6', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16'
    ];

    function getColor(key) {
        var s = key == null ? 'general' : String(key);
        var hash = 0;
        for (var i = 0; i < s.length; i++) {
            hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
        }
        return PALETTE[hash % PALETTE.length];
    }

    // #RRGGBB + アルファ(00-FF) の簡易合成
    function withAlpha(hex, alphaHex) {
        return hex + alphaHex;
    }

    function el(tag, className, attrs) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (attrs) {
            for (var k in attrs) {
                if (Object.prototype.hasOwnProperty.call(attrs, k)) {
                    node.setAttribute(k, attrs[k]);
                }
            }
        }
        return node;
    }

    function yearLabel(ev) {
        var start = ev.start;
        var end = (ev.end == null) ? ev.start : ev.end;
        return (start === end) ? (start + '年') : (start + '年 〜 ' + end + '年');
    }

    // 表示範囲（開始年・全年数）をイベントから動的に計算し、両端に余白を足す
    function computeRange(events) {
        var years = [];
        events.forEach(function (ev) {
            years.push(ev.start);
            years.push(ev.end == null ? ev.start : ev.end);
        });
        if (years.length === 0) {
            return { startYear: 1960, totalYears: 60 };
        }
        var minY = Math.min.apply(null, years);
        var maxY = Math.max.apply(null, years);
        var pad = 3;
        var startYear = Math.floor((minY - pad) / 5) * 5; // 5年単位に丸める
        var endYear = Math.ceil((maxY + pad) / 5) * 5;
        var totalYears = Math.max(10, endYear - startYear);
        return { startYear: startYear, totalYears: totalYears };
    }

    function leftPct(year, startYear, totalYears) {
        return ((year - startYear) / totalYears) * 100;
    }

    // ツールチップ生成（マーカー/バーに紐づく）
    function makeTooltip(ev, alignRight, openDown) {
        var cls = 'tl-tooltip';
        if (alignRight) cls += ' tl-tooltip--right';
        if (openDown) cls += ' tl-tooltip--down';
        var tip = el('div', cls);
        var title = el('p', 'tl-tooltip__title');
        title.textContent = ev.title;
        var date = el('p', 'tl-tooltip__date');
        date.textContent = yearLabel(ev);
        tip.appendChild(title);
        tip.appendChild(date);
        if (ev.summary) {
            var sum = el('p', 'tl-tooltip__summary');
            sum.textContent = ev.summary;
            tip.appendChild(sum);
        }
        return tip;
    }

    // 単年イベント（円マーカー）
    function makeMarker(ev, startYear, totalYears, color, openDown) {
        var lp = leftPct(ev.start, startYear, totalYears);
        if (lp < -2 || lp > 102) return null;

        var wrap = el('div', 'tl-marker');
        wrap.style.left = lp + '%';
        wrap.style.setProperty('--tl-color', color);
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('role', 'button');
        wrap.setAttribute('aria-label', ev.title + '（' + yearLabel(ev) + '）');

        var ring = el('div', 'tl-marker__ring');
        var dot = el('div', 'tl-marker__dot');
        ring.appendChild(dot);
        wrap.appendChild(ring);
        wrap.appendChild(makeTooltip(ev, lp > 70, openDown));
        return wrap;
    }

    // 期間イベント（バー）
    function makeBar(ev, startYear, totalYears, color, openDown) {
        var s = ev.start;
        var e = (ev.end == null ? ev.start : ev.end) + 1; // 終了年当年まで含む
        var viewEnd = startYear + totalYears;
        var cs = Math.max(s, startYear);
        var ce = Math.min(e, viewEnd);
        if (cs >= ce) return null;

        var lp = leftPct(cs, startYear, totalYears);
        var wp = ((ce - cs) / totalYears) * 100;

        var wrap = el('div', 'tl-bar');
        wrap.style.left = lp + '%';
        wrap.style.width = wp + '%';
        wrap.style.setProperty('--tl-color', color);
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('role', 'button');
        wrap.setAttribute('aria-label', ev.title + '（' + yearLabel(ev) + '）');

        var body = el('div', 'tl-bar__body');
        wrap.appendChild(body);
        wrap.appendChild(makeTooltip(ev, lp > 70, openDown));
        return wrap;
    }

    function renderTimeline(target, config) {
        var container = (typeof target === 'string')
            ? document.querySelector(target)
            : target;
        if (!container) return;

        var events = (config && config.events) ? config.events.slice() : [];
        container.innerHTML = '';
        container.classList.add('tl-root');

        if (events.length === 0) {
            var empty = el('div', 'tl-empty');
            empty.textContent = 'イベントがありません。';
            container.appendChild(empty);
            return;
        }

        var range = computeRange(events);
        var startYear = range.startYear;
        var totalYears = range.totalYears;
        var viewEnd = startYear + totalYears;

        // スクロール可能な内側ラッパー
        var scroller = el('div', 'tl-scroller');
        var chart = el('div', 'tl-chart');
        scroller.appendChild(chart);

        // --- 年ラベルヘッダー（5年刻み） ---
        var header = el('div', 'tl-header');
        for (var y = startYear; y <= viewEnd; y += 5) {
            var label = el('span', 'tl-header__label');
            label.style.left = leftPct(y, startYear, totalYears) + '%';
            label.textContent = y;
            header.appendChild(label);
        }
        chart.appendChild(header);

        // --- カテゴリごとに行をグループ化 ---
        var groups = {};
        var order = [];
        events.forEach(function (ev) {
            var key = ev.category || 'その他';
            if (!groups[key]) {
                groups[key] = [];
                order.push(key);
            }
            groups[key].push(ev);
        });

        // 表示順が指定されていればそれを優先
        if (config && config.categories && config.categories.length) {
            var specified = config.categories.filter(function (c) { return groups[c]; });
            var rest = order.filter(function (c) { return config.categories.indexOf(c) === -1; });
            order = specified.concat(rest);
        }

        order.forEach(function (cat, rowIndex) {
            var color = getColor(cat);
            var row = el('div', 'tl-row');

            var labelCell = el('div', 'tl-row__label');
            labelCell.style.setProperty('--tl-color', color);
            labelCell.textContent = cat;
            row.appendChild(labelCell);

            var track = el('div', 'tl-track');

            // 水平線
            var line = el('div', 'tl-track__line');
            line.style.backgroundColor = withAlpha(color, '55');
            track.appendChild(line);

            // 最上段の行はツールチップを下向きに開いて見切れを防ぐ
            var openDown = (rowIndex === 0);

            // イベント（開始年でソート）
            groups[cat].sort(function (a, b) { return a.start - b.start; });
            groups[cat].forEach(function (ev) {
                var isRange = (ev.end != null && ev.end !== ev.start);
                var node = isRange
                    ? makeBar(ev, startYear, totalYears, color, openDown)
                    : makeMarker(ev, startYear, totalYears, color, openDown);
                if (node) track.appendChild(node);
            });

            row.appendChild(track);
            chart.appendChild(row);
        });

        container.appendChild(scroller);

        // スクロールヒント
        var hint = el('div', 'tl-hint');
        hint.innerHTML = '<i class="fas fa-arrows-left-right"></i> 横スクロール・マーカーにカーソルを合わせると詳細が表示されます';
        container.appendChild(hint);
    }

    global.renderTimeline = renderTimeline;
})(window);
