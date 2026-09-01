Ext.define(
    'PVE.form.PoolSelector',
    {
        extend: 'Proxmox.form.ComboGrid',
        alias: ['widget.pvePoolSelector'],

        allowBlank: false,
        valueField: 'poolid',
        displayField: 'poolid',

        editable: true,
        anyMatch: true,
        forceSelection: true,

        // only allow pools nested up to this level, undefined means allow all
        maxLevel: undefined,

        validator: function (value) {
            let me = this;

            if (value && me.maxLevel) {
                let level = value.split('/').length;
                if (level > me.maxLevel) {
                    return Ext.String.format(
                        gettext('Selected pool is nested too deep (max level = {0})'),
                        me.maxLevel,
                    );
                }
            }

            return Proxmox.form.ComboGrid.prototype.validator.call(me, value);
        },

        initComponent: function () {
            var me = this;

            var store = new Ext.data.Store({
                model: 'pve-pools',
                sorters: 'poolid',
            });

            Ext.apply(me, {
                store: store,
                autoSelect: false,
                listConfig: {
                    columns: [
                        {
                            header: gettext('Pool'),
                            sortable: true,
                            dataIndex: 'poolid',
                            flex: 1,
                        },
                        {
                            header: gettext('Comment'),
                            sortable: false,
                            dataIndex: 'comment',
                            renderer: Ext.String.htmlEncode,
                            flex: 1,
                        },
                    ],
                },
            });

            me.callParent();

            store.load();
        },
    },
    function () {
        Ext.define('pve-pools', {
            extend: 'Ext.data.Model',
            fields: ['poolid', 'comment'],
            proxy: {
                type: 'proxmox',
                url: '/api2/json/pools',
            },
            idProperty: 'poolid',
        });
    },
);
