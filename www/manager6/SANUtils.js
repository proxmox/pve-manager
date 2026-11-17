Ext.define('pve-san-lun', {
    extend: 'Ext.data.Model',
    idProperty: 'wwid',
    fields: [
        'wwid',
        'name',
        'devpath',
        'by-id',
        'size',
        'transport',
        'vendor',
        'model',
        'serial',
        'state',
        'paths-active',
        'paths-total',
        'paths-expected',
        'path-list',
        'usage',
        'vgname',
        'detail',
        'used-by-storage',
        'used-by-guest',
        'used-by-process',
        'multipath',
        'multipath-storage',
        'iscsi-target',
        'iscsi-lun',
        // the texts of the Name and Used By columns, which also sort by them
        {
            name: 'display-name',
            depends: ['name', 'wwid'],
            calculate: (data) => data.name || data.wwid,
            sortType: 'asUCString',
        },
        {
            name: 'used-by',
            depends: [
                'used-by-storage',
                'used-by-guest',
                'used-by-process',
                'vgname',
                'detail',
                'usage',
            ],
            calculate: (data) => PVE.SANUtils.usageText(data),
            sortType: 'asUCString',
        },
        // what identifies the paths, as text for the search
        {
            name: 'path-search',
            depends: ['path-list'],
            calculate: (data) =>
                (data['path-list'] ?? [])
                    .flatMap((path) => [
                        path.device,
                        path['host-wwpn'],
                        path['target-wwpn'],
                        path.address,
                    ])
                    .filter(Boolean)
                    .join(' '),
        },
    ],
});

Ext.define('PVE.SANUtils', {
    singleton: true,

    // A LUN with a single path is fine, but has no path to fail over to, so it is not optimal.
    lunState: function (state, pathsTotal) {
        return state === 'optimal' && Number(pathsTotal) === 1 ? 'single-path' : state;
    },

    // Deselects the rows of a grid that the filters of its store hide. The buttons of a toolbar
    // act on the selected row, which must not be one that a search does not show.
    deselectHidden: function (grid) {
        let selModel = grid.getSelectionModel();
        let store = grid.getStore();
        selModel.deselect(selModel.getSelection().filter((rec) => !store.contains(rec)));
    },

    // Usable paths of a node out of those it has, or out of those it should have if more.
    pathCount: function (report) {
        let total = Math.max(report['paths-total'] ?? 0, report['paths-expected'] ?? 0);
        return `${report['paths-active']}/${total}`;
    },

    // How the multipath of a LUN is managed, as plain text. A LUN with one path and no map has no
    // other path to fail over to.
    multipathText: function (value, storage, pathsTotal) {
        if (value === 'storage' && storage) {
            return Ext.String.format(gettext('Storage "{0}"'), storage);
        }
        if (value === 'none' && Number(pathsTotal) === 1) {
            return gettext('Single path');
        }
        return (
            {
                none: gettext('Not enabled'),
                pending: gettext('Pending'),
                manual: gettext('Explicit entry'),
                storage: gettext('Storage'),
                unmanaged: gettext('Unmanaged'),
                native: gettext('Native'),
            }[value] ??
            value ??
            ''
        );
    },

    renderState: function (value) {
        if (!value) {
            return '';
        }
        let display = {
            ok: ['check-circle good', gettext('OK')],
            optimal: ['check-circle good', gettext('Optimal')],
            'single-path': ['check-circle good', gettext('OK (1 path)')],
            degraded: ['exclamation-circle warning', gettext('Degraded')],
            failed: ['times-circle critical', gettext('Failed')],
            missing: ['times-circle critical', gettext('Missing')],
            unknown: ['question-circle faded', gettext('Unknown')],
            unavailable: ['exclamation-circle warning', gettext('Multipath unavailable')],
            'no-report': ['question-circle faded', gettext('No current report')],
            'logged-in': ['check-circle good', gettext('Connected')],
            recovering: ['exclamation-circle warning', gettext('Reconnecting')],
            'not-connected': ['times-circle faded', gettext('Not connected')],
        }[value];
        let [icon, label] = display ?? ['question-circle faded', value];
        return `<i class="fa fa-fw fa-${icon}"></i> ${Ext.htmlEncode(label)}`;
    },

    // The path counts tell why a LUN is degraded while all of its listed paths are usable: the
    // kernel removes a lost path after a while.
    renderLunState: function (value, metaData, rec) {
        let state = PVE.SANUtils.lunState(value, rec.get('paths-total'));
        let text = PVE.SANUtils.renderState(state);
        if (['degraded', 'failed'].includes(state) && rec.get('paths-active') !== undefined) {
            text += ` (${Ext.htmlEncode(PVE.SANUtils.pathCount(rec.data))})`;
        }
        return text;
    },

    renderSanLunMultipath: function (value, metaData, rec) {
        return Ext.htmlEncode(
            PVE.SANUtils.multipathText(value, rec.get('multipath-storage'), rec.get('paths-total')),
        );
    },

    usageText: function (row) {
        return (
            row['used-by-storage'] ||
            // also if the LUN has a volume group, which is then usually the guest's own
            (row['used-by-guest'] && `VM ${row['used-by-guest']}`) ||
            (row['used-by-process'] &&
                Ext.String.format(gettext('Process {0}'), row['used-by-process'])) ||
            row.vgname ||
            row.detail ||
            {
                unused: gettext('Unused'),
                lvm: gettext('LVM physical volume'),
                other: gettext('Other'),
            }[row.usage] ||
            ''
        );
    },

    // Selects Datacenter > Storage > SAN, as the TFA entry of the user menu does for its panel.
    showSANView: function () {
        Ext.state.Manager.getProvider().set('dctab', { value: 'san' }, true);
        Ext.ComponentQuery.query('pveStdWorkspace')[0]?.selectById('root');
    },

    // A note for the add dialogs of storages on a SAN, which points to the guided setups of the
    // SAN view. Its link closes the dialog and opens the view.
    sanViewNote: function (text) {
        let path = `${gettext('Datacenter')} > ${gettext('Storage')} > SAN`;
        let link = `<a href="#" style="white-space: nowrap;">${Ext.htmlEncode(path)}</a>`;
        return {
            xtype: 'component',
            margin: '5 0 0 0',
            html:
                `<span class="pmx-hint">${Ext.htmlEncode(gettext('Note:'))}</span> ` +
                Ext.String.format(Ext.htmlEncode(text), link),
            listeners: {
                afterrender: function (cmp) {
                    let follow = function (event) {
                        event.stopEvent();
                        cmp.up('window')?.close();
                        PVE.SANUtils.showSANView();
                    };
                    cmp.mon(cmp.getEl(), 'click', follow, null, { delegate: 'a' });
                    // an edit window handles Enter for its default button, so no click follows it
                    cmp.mon(
                        cmp.getEl(),
                        'keydown',
                        (event) => event.getKey() === event.ENTER && follow(event),
                        null,
                        { delegate: 'a' },
                    );
                },
            },
        };
    },

    renderSanTransport: function (value) {
        return Ext.htmlEncode(
            {
                iscsi: 'iSCSI',
                iser: 'iSER',
                fc: 'FC',
                fcoe: 'FCoE',
                sas: 'SAS',
                nvme: 'NVMe',
                'nvme-tcp': 'NVMe/TCP',
                'nvme-rdma': 'NVMe/RDMA',
                'nvme-fc': 'NVMe/FC',
            }[value] ??
                value ??
                '',
        );
    },
});
