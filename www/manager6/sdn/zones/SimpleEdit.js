Ext.define('PVE.sdn.zones.SimpleInputPanel', {
    extend: 'PVE.panel.SDNZoneBase',

    onlineHelp: 'pvesdn_zone_plugin_simple',

    getAdditionalTabs: function () {
        return [
            {
                xtype: 'pveSDNStaticRoutes',
                title: gettext('Static Routes'),
                onlineHelp: this.onlineHelp,
                name: 'route',
                isCreate: this.isCreate,
                // routes are installed in the dedicated VRF, enabled with its checkbox
                disabled: true,
                tabConfig: {
                    tooltip: gettext('Requires a dedicated VRF'),
                },
            },
        ];
    },

    onGetValues: function (values) {
        var me = this;

        if (me.isCreate) {
            values.type = me.type;
        } else {
            delete values.zone;
        }

        return values;
    },

    initComponent: function () {
        var me = this;

        me.items = [];
        me.advancedItems = [
            {
                xtype: 'proxmoxcheckbox',
                name: 'dedicated-vrf',
                fieldLabel: gettext('Dedicated VRF'),
                checked: false,
                uncheckedValue: 0,
                defaultValue: 0,
                deleteDefaultValue: !me.isCreate,
                listeners: {
                    change: (field, checked) => {
                        field.up('window')?.down('pveSDNStaticRoutes')?.setDisabled(!checked);
                    },
                },
            },
            {
                xtype: 'proxmoxcheckbox',
                name: 'dhcp',
                inputValue: 'dnsmasq',
                uncheckedValue: null,
                checked: false,
                fieldLabel: gettext('Automatic DHCP'),
                deleteEmpty: !me.isCreate,
            },
        ];

        me.callParent();
    },
});
