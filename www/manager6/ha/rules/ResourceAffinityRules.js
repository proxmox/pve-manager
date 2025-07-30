Ext.define('PVE.ha.ResourceAffinityRulesView', {
    extend: 'PVE.ha.RulesBaseView',
    alias: 'widget.pveHAResourceAffinityRulesView',

    ruleType: 'resource-affinity',
    ruleTitle: gettext('HA Resource Affinity'),
    inputPanel: 'ResourceAffinityInputPanel',
    faIcon: 'link',

    stateful: true,
    stateId: 'grid-ha-resource-affinity-rules',

    initComponent: function () {
        let me = this;

        me.columns = [
            {
                header: gettext('Affinity'),
                width: 100,
                dataIndex: 'affinity',
            },
            {
                header: gettext('HA Resources'),
                flex: 1,
                dataIndex: 'resources',
            },
        ];

        me.callParent();
    },
});
