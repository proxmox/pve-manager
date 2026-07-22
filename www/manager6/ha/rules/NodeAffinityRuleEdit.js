Ext.define('PVE.ha.rules.NodeAffinityInputPanel', {
    extend: 'PVE.ha.RuleInputPanel',

    viewModel: {
        data: {
            affinity: 'positive',
        },
        formulas: {
            isPositiveNodeAffinity: (get) => get('affinity') === 'positive',
        },
    },

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
            {
                xtype: 'proxmoxKVComboBox',
                name: 'affinity',
                fieldLabel: gettext('Affinity'),
                allowBlank: false,
                comboItems: [
                    ['positive', `${gettext('Prefer Nodes')} (positive)`],
                    ['negative', `${gettext('Avoid Nodes')} (negative)`],
                ],
                bind: {
                    value: '{affinity}',
                },
            },
        ];

        me.columnB = [
            {
                xtype: 'pveNodePrioritySelector',
                name: 'nodes',
                allowBlank: false,
                bind: {
                    useNodePriority: '{isPositiveNodeAffinity}',
                },
            },
        ];

        me.callParent();
    },
});
