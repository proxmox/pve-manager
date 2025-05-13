Ext.define('PVE.sdn.zones.VxlanInputPanel', {
    extend: 'PVE.panel.SDNZoneBase',

    onlineHelp: 'pvesdn_zone_plugin_vxlan',

    onGetValues: function (values) {
        var me = this;

        if (me.isCreate) {
            values.type = me.type;
        } else {
            delete values.zone;
        }

        delete values.mode;

        return values;
    },

    initComponent: function () {
        var me = this;

        me.items = [
            {
                xtype: 'textfield',
                name: 'peers',
                fieldLabel: gettext('Peer Address List'),
                allowBlank: false,
            },
        ];

        me.callParent();
    },
});
