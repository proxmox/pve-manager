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
        {
            name: 'target',
            depends: ['iscsi-target', 'nvme-subsystem'],
            calculate: (data) => data['iscsi-target'] || data['nvme-subsystem'] || '',
            sortType: 'asUCString',
        },
        {
            name: 'lun',
            depends: ['iscsi-lun', 'nvme-nsid'],
            calculate: (data) => data['iscsi-lun'] ?? data['nvme-nsid'],
        },
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

    // deselect rows hidden by store filters so toolbar actions cannot target them
    deselectHidden: function (grid) {
        let selModel = grid.getSelectionModel();
        let store = grid.getStore();
        selModel.deselect(selModel.getSelection().filter((rec) => !store.contains(rec)));
    },

    // DiffStore updates rows in place without firing selectionchange, so re-notify toolbar buttons
    refreshSelection: function (grid) {
        PVE.SANUtils.deselectHidden(grid);
        let selModel = grid.getSelectionModel();
        let selection = selModel.getSelection();
        if (selection.length) {
            selModel.fireEvent('selectionchange', selModel, selection);
        }
    },

    pathCount: function (report) {
        if (report['paths-active'] === undefined || report['paths-total'] === undefined) {
            return undefined;
        }
        let total = Math.max(report['paths-total'], report['paths-expected'] ?? 0);
        return total ? `${report['paths-active']}/${total}` : undefined;
    },

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

    // nodes only report an initiator name if they have a usable open-iscsi
    iscsiMissing: function (report) {
        return report.state !== 'no-report' && !report['iscsi-initiator-name'];
    },

    renderInitiatorName: function (value, metaData, rec) {
        if (rec.get('iscsi-missing')) {
            let text = Ext.htmlEncode(gettext('open-iscsi not installed'));
            return `<i class="fa fa-fw fa-info-circle faded"></i> ${text}`;
        }
        return Ext.htmlEncode(value);
    },

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
            'no-iscsi': ['times-circle critical', gettext('open-iscsi not installed')],
            'logged-in': ['check-circle good', gettext('Connected')],
            recovering: ['exclamation-circle warning', gettext('Reconnecting')],
            'not-connected': ['times-circle faded', gettext('Not connected')],
            live: ['check-circle good', gettext('Connected')],
            connecting: ['exclamation-circle warning', gettext('Reconnecting')],
            resetting: ['exclamation-circle warning', gettext('Reconnecting')],
            deleting: ['times-circle faded', gettext('Disconnecting')],
            'deleting (no IO)': ['times-circle faded', gettext('Disconnecting')],
        }[state];
        let [icon, label] = display ?? ['question-circle faded', state];
        return `<i class="fa fa-fw fa-${icon}"></i> ${Ext.htmlEncode(text ?? label)}`;
    },

    renderState: function (value) {
        return value ? PVE.SANUtils.stateHtml(value) : '';
    },

    // unmapped LUNs have no failover, so omit the green check icon for optimal ones
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
            // prefer guest over vgname, which is usually the guest's own VG
            (row['used-by-guest'] && `VM ${row['used-by-guest']}`) ||
            (row['used-by-process'] &&
                Ext.String.format(gettext('Process {0}'), row['used-by-process'])) ||
            row.vgname ||
            row.detail ||
            {
                unused: gettext('No use detected'),
                lvm: gettext('LVM physical volume'),
                other: gettext('Other'),
            }[row.usage] ||
            ''
        );
    },

    requiresText: function (privilege, path) {
        return Ext.String.format(gettext('Requires {0} on {1}.'), privilege, path);
    },

    setupBlocker: function (type) {
        let { storage, dc } = Ext.state.Manager.get('GuiCap');
        if (!storage['Datastore.Allocate']) {
            return PVE.SANUtils.requiresText('Datastore.Allocate', '/storage');
        }
        // The setups also read the storage list and the LUNs of the iSCSI storage.
        if (!storage['Datastore.Audit'] && !storage['Datastore.AllocateSpace']) {
            return Ext.String.format(
                gettext('Requires {0} or {1} on {2}.'),
                'Datastore.Audit',
                'Datastore.AllocateSpace',
                '/storage',
            );
        }
        // the multipath entry of a Fibre Channel LUN is cluster-wide configuration
        if (type === 'fc' && !dc['Sys.Modify']) {
            return PVE.SANUtils.requiresText('Sys.Modify', '/');
        }
        return undefined;
    },

    canSetup: function (type) {
        return !PVE.SANUtils.setupBlocker(type);
    },

    openSetup: function (type, reloadCallback) {
        Ext.create('PVE.storage.AddWizard', {
            preselect: `setup:${type}`,
            autoShow: true,
            reloadCallback,
        });
    },

    // A portal that is still being typed: a lookup would take "192.168" for 192.0.0.168.
    portalIncomplete: function (portal) {
        return (
            /[.:[]$/.test(portal) ||
            (portal.startsWith('[') && !portal.includes(']')) ||
            (/^[0-9.]+$/.test(portal) && !/^(\d+\.){3}\d+$/.test(portal))
        );
    },

    nvmePortalValid: function (portal) {
        let [, ip6, ip4, port] = portal.match(/^(?:\[(.+)\]|([0-9.]+))(?::([0-9]+))?$/) ?? [];
        if (port !== undefined && !(port >= 1 && port <= 65535)) {
            return false;
        }
        return ip6
            ? Proxmox.Utils.IP64_match.test(ip6)
            : !!ip4 && Proxmox.Utils.IP4_match.test(ip4);
    },

    validateNVMePortals: function (value, list) {
        let entries = `${value ?? ''}`.trim();
        let parts = (list ? entries.split(/[\s,;]+/) : [entries]).filter(Boolean);
        // a list of only separators names no portal, which the storage refuses too
        let invalid = parts.length
            ? parts.find((entry) => !PVE.SANUtils.nvmePortalValid(entry))
            : entries || undefined;
        return (
            invalid === undefined ||
            Ext.String.format(
                gettext(
                    'Invalid portal "{0}". Use an IPv4 address or an IPv6 address in brackets, optionally with a port.',
                ),
                Ext.htmlEncode(invalid),
            )
        );
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
