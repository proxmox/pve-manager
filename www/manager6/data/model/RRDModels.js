Ext.define('pve-rrd-node', {
    extend: 'Ext.data.Model',
    fields: [
        {
            name: 'cpu',
            // percentage
            convert: function (value) {
                return value * 100;
            },
        },
        {
            name: 'iowait',
            // percentage
            convert: function (value) {
                return value * 100;
            },
        },
        'loadavg',
        'maxcpu',
        'memtotal',
        'memused',
        'netin',
        'netout',
        'roottotal',
        'rootused',
        'swaptotal',
        'swapused',
        'memfree',
        'arcsize',
        'pressurecpusome',
        'pressureiosome',
        'pressureiofull',
        'pressurememorysome',
        'pressurememoryfull',
        { type: 'date', dateFormat: 'timestamp', name: 'time' },
        {
            name: 'memfree-capped',
            calculate: function (data) {
                if (data.memtotal >= 0 && data.memused >= 0 && data.memtotal >= data.memused) {
                    return data.memtotal - data.memused;
                }
                return null;
            },
        },
        {
            name: 'memused-sub-arcsize',
            calculate: function (data) {
                let arcsize = data.arcsize ?? 0; // pre pve9 nodes don't report any arcsize
                if (data.memused >= 0 && arcsize >= 0 && data.memused >= arcsize) {
                    return data.memused - arcsize;
                }
                return null;
            },
        },
    ],
});

Ext.define('pve-rrd-guest', {
    extend: 'Ext.data.Model',
    fields: [
        {
            name: 'cpu',
            // percentage
            convert: function (value) {
                return value * 100;
            },
        },
        'maxcpu',
        'netin',
        'netout',
        { name: 'mem', defaultValue: null },
        'maxmem',
        'disk',
        'maxdisk',
        'diskread',
        'diskwrite',
        'memhost',
        'pressurecpusome',
        'pressurecpufull',
        'pressureiosome',
        'pressurecpufull',
        'pressurememorysome',
        'pressurememoryfull',
        { type: 'date', dateFormat: 'timestamp', name: 'time' },
        {
            name: 'memfree-capped',
            calculate: function (data) {
                if (data.maxmem >= 0 && data.mem >= 0 && data.maxmem >= data.mem) {
                    return data.maxmem - data.mem;
                }
                return null;
            },
        },
    ],
});

Ext.define('pve-rrd-storage', {
    extend: 'Ext.data.Model',
    fields: ['used', 'total', { type: 'date', dateFormat: 'timestamp', name: 'time' }],
});
