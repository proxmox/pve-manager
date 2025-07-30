Ext.define('PVE.ha.NodeAffinityRulesView', {
    extend: 'PVE.ha.RulesBaseView',
    alias: 'widget.pveHANodeAffinityRulesView',

    ruleType: 'node-affinity',
    ruleTitle: gettext('HA Node Affinity'),
    inputPanel: 'NodeAffinityInputPanel',
    faIcon: 'map-pin',

    stateful: true,
    stateId: 'grid-ha-node-affinity-rules',

    initComponent: function () {
        let me = this;

        me.columns = [
            {
                header: gettext('Strict'),
                width: 75,
                dataIndex: 'strict',
            },
            {
                header: gettext('HA Resources'),
                flex: 1,
                dataIndex: 'resources',
            },
            {
                header: gettext('Nodes'),
                flex: 1,
                dataIndex: 'nodes',
            },
        ];

        me.callParent();
    },
});
