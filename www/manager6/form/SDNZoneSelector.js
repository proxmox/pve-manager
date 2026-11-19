Ext.define(
    'PVE.form.SDNZoneSelector',
    {
        extend: 'Proxmox.form.ComboGrid',
        alias: ['widget.pveSDNZoneSelector'],

        allowBlank: false,
        // Use 'vrf' to submit the native VRF interface name instead of the zone ID.
        valueField: 'zone',
        displayField: 'zone',

        // Only show simple zones which create a dedicated VRF.
        vrfOnly: false,

        // Only show zones available on this node, if specified.
        nodename: undefined,

        // Only show zones from the applied SDN configuration, not pending changes.
        running: false,

        initComponent: function () {
            var me = this;

            var store = new Ext.data.Store({
                model: 'pve-sdn-zone',
                sorters: {
                    property: 'zone',
                    direction: 'ASC',
                },
                filters: [
                    function (record) {
                        return (
                            !me.vrfOnly ||
                            (record.get('type') === 'simple' && record.get('dedicated-vrf'))
                        );
                    },
                    function (record) {
                        let nodes = record.get('nodes');
                        return !me.nodename || !nodes || nodes.split(',').includes(me.nodename);
                    },
                ],
            });

            if (me.running) {
                // Don't touch the shared model proxy, other selectors need the pending config.
                store.setProxy({
                    type: 'proxmox',
                    url: '/api2/json/cluster/sdn/zones',
                    extraParams: { running: 1 },
                });
            }

            Ext.apply(me, {
                store: store,
                autoSelect: false,
                listConfig: {
                    columns: [
                        {
                            header: gettext('Zone'),
                            sortable: true,
                            dataIndex: 'zone',
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
        Ext.define('pve-sdn-zone', {
            extend: 'Ext.data.Model',
            fields: [
                'zone',
                'type',
                'nodes',
                {
                    name: 'vrf',
                    // Preserve custom values in the synthetic records created by ComboBox.
                    convert: (value, record) => {
                        let zone = record.get('zone');
                        return value ?? (zone ? `vrf_${zone}` : value);
                    },
                },
                { name: 'dedicated-vrf', type: 'boolean', defaultValue: false },
            ],
            proxy: {
                type: 'proxmox',
                url: '/api2/json/cluster/sdn/zones',
            },
            idProperty: 'zone',
        });
    },
);
