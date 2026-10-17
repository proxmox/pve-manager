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
        }[value];
        let [icon, label] = display ?? ['question-circle faded', value];
        return `<i class="fa fa-fw fa-${icon}"></i> ${Ext.htmlEncode(label)}`;
    },
});
