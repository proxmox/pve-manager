Ext.define('PVE.sdn.Fabric.Redistribution', {
    extend: 'Ext.data.Model',
    fields: ['source'],
});

Ext.define('PVE.sdn.Fabric.RedistributionGrid', {
    alias: 'widget.pveSDNRedistributionGrid',
    extend: 'Ext.grid.Panel',
    mixins: ['Ext.form.field.Field'],

    config: {
        sources: [],
        additionalColumns: [],
    },

    store: {
        model: 'PVE.sdn.Fabric.Redistribution',
        listeners: {
            update: 'handleUpdate',
        },
    },

    tbar: [
        '->',
        {
            text: gettext('Add'),
            handler: 'addRedistribution',
        },
    ],

    border: false,

    columns: [],

    controller: {
        xclass: 'Ext.app.ViewController',

        addRedistribution: function () {
            let me = this;

            let source = me.getView().getSources()[0][0];

            me.getView().getStore().add({
                source,
            });

            me.handleUpdate();
        },

        deleteRedistribution: function (table, rI, cI, item, e, rec) {
            let me = this;
            me.getView().getStore().remove(rec);
            me.handleUpdate();
        },

        onValueChange: function (field, value) {
            let me = this;
            let record = field.getWidgetRecord();
            if (!record) {
                return;
            }
            let column = field.getWidgetColumn();
            record.set(column.dataIndex, value);
            record.commit();
            me.handleUpdate();
        },

        handleUpdate: function () {
            let me = this;
            me.getView().checkChange();
        },

        control: {
            field: {
                change: 'onValueChange',
            },
        },
    },

    initComponent: function () {
        let me = this;

        if (me.getSources().length === 0) {
            throw 'must define at least one redistribution source!';
        }

        me.columns = [
            {
                text: gettext('Source'),
                xtype: 'widgetcolumn',
                dataIndex: 'source',
                flex: 1,
                widget: {
                    xtype: 'proxmoxKVComboBox',
                    comboItems: me.getSources(),
                    isFormField: false,
                },
            },
            {
                // TRANSLATORS: "Route map" refers to an FRR route map, some
                // languages may prefer to keep it as-is:
                // https://docs.frrouting.org/en/latest/routemap.html
                text: gettext('Route Map'),
                xtype: 'widgetcolumn',
                dataIndex: 'route-map',
                flex: 1,
                widget: {
                    xtype: 'pveSDNRouteMapSelector',
                    isFormField: false,
                },
            },
            ...me.getAdditionalColumns(),
            {
                text: gettext('Action'),
                xtype: 'actioncolumn',
                width: 100,
                items: [
                    {
                        tooltip: gettext('Delete'),
                        handler: 'deleteRedistribution',
                        iconCls: 'fa critical fa-trash-o',
                    },
                ],
            },
        ];

        me.callParent();
    },

    isEqual: function (value1, value2) {
        return JSON.stringify(value1) === JSON.stringify(value2);
    },

    getValue: function () {
        let me = this;

        return me
            .getStore()
            .getData()
            .items.map((record) => {
                let data = {};

                for (const [key, value] of Object.entries(record.data)) {
                    if (value === '' || value === undefined || value === null || key === 'id') {
                        continue;
                    }
                    data[key] = value;
                }

                return PVE.Parser.printPropertyString(data, undefined);
            });
    },

    setValue: function (value) {
        let me = this;

        me.getStore().setData((value ?? []).map((item) => PVE.Parser.parsePropertyString(item)));
        me.resetOriginalValue();
    },

    getSubmitData: function () {
        let me = this;

        let name = me.getName();
        let value = me.getValue();

        if (value.length === 0 && !me.isCreate) {
            return {
                delete: name,
            };
        }

        return {
            [name]: value,
        };
    },

    getErrors: function (value) {
        let me = this;

        let errors = [];
        let sourceCount = {};

        for (const record of me.getStore().getData().items) {
            sourceCount[record.data.source] ??= 0;
            sourceCount[record.data.source]++;

            if (sourceCount[record.data.source] === 2) {
                errors.push(`Duplicate source: ${record.data.source}`);
            }
        }

        return errors;
    },
});
