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
        'nvme-subsystem',
        'nvme-nsid',
        // one column shows the target of a LUN and the subsystem of a namespace
        {
            name: 'target',
            depends: ['iscsi-target', 'nvme-subsystem'],
            calculate: (data) => data['iscsi-target'] || data['nvme-subsystem'] || '',
            sortType: 'asUCString',
        },
        // and one the number of a LUN and the ID of a namespace
        {
            name: 'lun',
            depends: ['iscsi-lun', 'nvme-nsid'],
            calculate: (data) => data['iscsi-lun'] ?? data['nvme-nsid'],
        },
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

    // Deselects the rows of a grid that the filters of its store hide. The buttons of a toolbar
    // act on the selected row, which must not be one that a search does not show.
    deselectHidden: function (grid) {
        let selModel = grid.getSelectionModel();
        let store = grid.getStore();
        selModel.deselect(selModel.getSelection().filter((rec) => !store.contains(rec)));
    },

    // Usable paths of a node out of those it has, or out of those it should have if more.
    pathCount: function (report) {
        if (report['paths-active'] === undefined || report['paths-total'] === undefined) {
            return undefined;
        }
        let total = Math.max(report['paths-total'], report['paths-expected'] ?? 0);
        return total ? `${report['paths-active']}/${total}` : undefined;
    },

    // How the multipath of a LUN is managed, as plain text.
    multipathText: function (value, storage) {
        if (value === 'storage' && storage) {
            return Ext.String.format(gettext('Storage "{0}"'), storage);
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

    // A state with its icon, and with its label unless another text is given.
    stateHtml: function (state, text) {
        let display = {
            ok: ['check-circle good', gettext('OK')],
            optimal: ['check-circle good', gettext('Optimal')],
            degraded: ['exclamation-circle warning', gettext('Degraded')],
            failed: ['times-circle critical', gettext('Failed')],
            missing: ['times-circle critical', gettext('Missing')],
            unknown: ['question-circle faded', gettext('Unknown')],
            unavailable: ['exclamation-circle warning', gettext('Multipath unavailable')],
            'no-report': ['question-circle faded', gettext('No current report')],
            'logged-in': ['check-circle good', gettext('Connected')],
            recovering: ['exclamation-circle warning', gettext('Reconnecting')],
            'not-connected': ['times-circle faded', gettext('Not connected')],
        }[state];
        let [icon, label] = display ?? ['question-circle faded', state];
        return `<i class="fa fa-fw fa-${icon}"></i> ${Ext.htmlEncode(text ?? label)}`;
    },

    renderState: function (value) {
        return value ? PVE.SANUtils.stateHtml(value) : '';
    },

    // The state of a LUN on a node, as its path count where the report has one. Without a map there
    // is no failover, so a fine LUN gets no check.
    renderLunReport: function (report, unmapped) {
        let state = report.state;
        let count = PVE.SANUtils.pathCount(report);
        if (!count || !['optimal', 'degraded', 'failed'].includes(state)) {
            return PVE.SANUtils.renderState(state);
        } else if (state === 'failed') {
            return PVE.SANUtils.stateHtml(state, Ext.String.format(gettext('Failed ({0})'), count));
        } else if (unmapped && state === 'optimal') {
            return Ext.htmlEncode(count);
        }
        return PVE.SANUtils.stateHtml(state, count);
    },

    // The counts behind a path count, for its tooltip.
    pathDetail: function (report) {
        if (report['paths-active'] === undefined || report['paths-total'] === undefined) {
            return '';
        }
        return report['paths-expected'] === undefined
            ? Ext.String.format(
                  gettext('{0} of {1} paths usable, no expected count set'),
                  report['paths-active'],
                  report['paths-total'],
              )
            : Ext.String.format(
                  gettext('{0} of {1} paths usable, {2} expected'),
                  report['paths-active'],
                  report['paths-total'],
                  report['paths-expected'],
              );
    },

    renderLunState: function (value, metaData, rec) {
        let detail = PVE.SANUtils.pathDetail(rec.data);
        if (detail) {
            metaData.tdAttr = `data-qtip="${Ext.htmlEncode(Ext.htmlEncode(detail))}"`;
        }
        return PVE.SANUtils.renderLunReport(rec.data, rec.get('multipath') === 'none');
    },

    renderSanLunMultipath: function (value, metaData, rec) {
        return Ext.htmlEncode(PVE.SANUtils.multipathText(value, rec.get('multipath-storage')));
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
                // the usage comes from the cached data of one node and cannot rule out others
                unused: gettext('No use detected'),
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
