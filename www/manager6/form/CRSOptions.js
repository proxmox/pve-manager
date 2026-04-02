Ext.define('PVE.form.CRSOptions', {
    extend: 'Proxmox.window.Edit',
    alias: 'widget.pveCRSOptions',

    width: 450,
    url: '/api2/extjs/cluster/options',
    onlineHelp: 'ha_manager_crs',

    fieldDefaults: {
        labelWidth: 120,
    },

    setValues: function (values) {
        Ext.Array.each(this.query('inputpanel'), (panel) => {
            panel.setValues(values.crs);
        });
    },

    items: [
        {
            xtype: 'inputpanel',
            onGetValues: function (values) {
                if (values === undefined || Object.keys(values).length === 0) {
                    return { delete: 'crs' };
                } else {
                    return { crs: PVE.Parser.printPropertyString(values) };
                }
            },
            items: [
                {
                    xtype: 'proxmoxKVComboBox',
                    name: 'ha',
                    fieldLabel: gettext('HA Scheduling'),
                    deleteEmpty: false,
                    value: '__default__',
                    comboItems: [
                        ['__default__', Proxmox.Utils.defaultText + ' (basic)'],
                        ['basic', gettext('Basic (Resource Count)')],
                        ['static', gettext('Static Load')],
                        ['dynamic', gettext('Dynamic Load')],
                    ],
                    defaultValue: '__default__',
                },
                {
                    xtype: 'proxmoxcheckbox',
                    name: 'ha-rebalance-on-start',
                    fieldLabel: gettext('Rebalance on Start'),
                    boxLabel: gettext(
                        'Use CRS to select the least loaded node when starting an HA service',
                    ),
                    value: 0,
                },
            ],
        },
    ],
});
