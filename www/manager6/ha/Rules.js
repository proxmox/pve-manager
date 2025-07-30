Ext.define('PVE.ha.RulesBaseView', {
    extend: 'Ext.grid.GridPanel',

    initComponent: function () {
        let me = this;

        if (!me.ruleType) {
            throw 'no rule type given';
        }

        let store = new Ext.data.Store({
            model: 'pve-ha-rules',
            autoLoad: true,
            filters: [
                {
                    property: 'type',
                    value: me.ruleType,
                },
            ],
        });

        let reloadStore = () => store.load();

        let sm = Ext.create('Ext.selection.RowModel', {});

        let createRuleEditWindow = (ruleId) => {
            if (!me.inputPanel) {
                throw `no editor registered for ha rule type: ${me.ruleType}`;
            }

            Ext.create('PVE.ha.RuleEdit', {
                panelType: `PVE.ha.rules.${me.inputPanel}`,
                panelName: me.ruleTitle,
                ruleType: me.ruleType,
                ruleId: ruleId,
                autoShow: true,
                listeners: {
                    destroy: reloadStore,
                },
            });
        };

        let runEditor = () => {
            let rec = sm.getSelection()[0];
            if (!rec) {
                return;
            }
            let { rule } = rec.data;
            createRuleEditWindow(rule);
        };

        let editButton = Ext.create('Proxmox.button.Button', {
            text: gettext('Edit'),
            disabled: true,
            selModel: sm,
            handler: runEditor,
        });

        let removeButton = Ext.create('Proxmox.button.StdRemoveButton', {
            selModel: sm,
            baseurl: '/cluster/ha/rules/',
            callback: reloadStore,
        });

        Ext.apply(me, {
            store: store,
            selModel: sm,
            viewConfig: {
                trackOver: false,
            },
            emptyText: Ext.String.format(gettext('No {0} rules configured.'), me.ruleTitle),
            tbar: [
                {
                    text: gettext('Add'),
                    handler: () => createRuleEditWindow(),
                },
                editButton,
                removeButton,
            ],
            listeners: {
                activate: reloadStore,
                itemdblclick: runEditor,
            },
        });

        me.columns.unshift(
            {
                header: gettext('Enabled'),
                width: 80,
                dataIndex: 'disable',
                align: 'center',
                renderer: function (value) {
                    return Proxmox.Utils.renderEnabledIcon(!value);
                },
                sortable: true,
            },
            {
                header: gettext('State'),
                xtype: 'actioncolumn',
                width: 65,
                align: 'center',
                dataIndex: 'errors',
                items: [
                    {
                        handler: (table, rowIndex, colIndex, item, event, { data }) => {
                            let errors = Object.keys(data.errors ?? {});
                            if (!errors.length) {
                                return;
                            }

                            Ext.create('PVE.ha.RuleErrorsModal', {
                                autoShow: true,
                                errors: data.errors ?? {},
                            });
                        },
                        getTip: (value) => {
                            let errors = Object.keys(value ?? {});
                            if (errors.length) {
                                return gettext('HA Rule has conflicts and/or errors.');
                            } else {
                                return gettext('HA Rule is OK.');
                            }
                        },
                        getClass: (value) => {
                            let iconName = 'check';

                            let errors = Object.keys(value ?? {});
                            if (errors.length) {
                                iconName = 'exclamation-triangle';
                            }

                            return `fa fa-${iconName}`;
                        },
                    },
                ],
            },
        );

        me.columns.push({
            header: gettext('Comment'),
            flex: 1,
            renderer: Ext.String.htmlEncode,
            dataIndex: 'comment',
        });

        me.callParent();
    },
});

Ext.define(
    'PVE.ha.RulesView',
    {
        extend: 'Ext.panel.Panel',
        alias: 'widget.pveHARulesView',

        onlineHelp: 'ha_manager_rules',

        layout: {
            type: 'vbox',
            align: 'stretch',
        },

        items: [
            {
                title: gettext('HA Node Affinity Rules'),
                xtype: 'pveHANodeAffinityRulesView',
                flex: 1,
                border: 0,
            },
            {
                xtype: 'splitter',
                collapsible: false,
                performCollapse: false,
            },
            {
                title: gettext('HA Resource Affinity Rules'),
                xtype: 'pveHAResourceAffinityRulesView',
                flex: 1,
                border: 0,
            },
        ],
    },
    function () {
        Ext.define('pve-ha-rules', {
            extend: 'Ext.data.Model',
            fields: [
                'rule',
                'type',
                'nodes',
                'digest',
                'errors',
                'disable',
                'comment',
                'affinity',
                'resources',
                {
                    name: 'strict',
                    type: 'boolean',
                },
            ],
            proxy: {
                type: 'proxmox',
                url: '/api2/json/cluster/ha/rules',
            },
            idProperty: 'rule',
        });
    },
);
