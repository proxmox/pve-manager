Ext.define('PVE.ha.rules.NodeAffinityInputPanel', {
    extend: 'PVE.ha.RuleInputPanel',

    initComponent: function () {
        let me = this;

        me.column2 = [
            {
                xtype: 'proxmoxcheckbox',
                name: 'strict',
                fieldLabel: gettext('Strict'),
                autoEl: {
                    tag: 'div',
                    'data-qtip': gettext(
                        'Enable if the HA Resources must be restricted to the nodes.',
                    ),
                },
                uncheckedValue: 0,
                defaultValue: 0,
            },
        ];

        me.columnB = [
            {
                xtype: 'pveNodePrioritySelector',
                name: 'nodes',
                allowBlank: false,
            },
        ];

        me.callParent();
    },
});
