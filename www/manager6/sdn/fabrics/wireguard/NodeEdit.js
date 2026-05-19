Ext.define('PVE.sdn.Fabric.WireGuard.Node.Edit', {
    extend: 'PVE.sdn.Fabric.Node.Edit',
    protocol: 'wireguard',
    onlineHelp: 'pvesdn_wireguard_node',

    extraRequestParams: {
        protocol: 'wireguard',
    },

    referenceHolder: true,

    // handled in the interface configuration (for now)
    hasIpv4Support: false,
    hasIpv6Support: false,

    defaultEndpointPort: 51820,

    viewModel: {
        data: {
            current: {
                isPveNode: true,
            },
        },
        formulas: {
            disableNameField: function (get) {
                let me = this;
                return !me.getView().isCreate || get('current.isPveNode');
            },
        },
    },

    additionalItems: [
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Name'),
            labelWidth: 120,
            name: 'node_id',
            hidden: true,
            bind: {
                hidden: '{current.isPveNode}',
                disabled: '{disableNameField}',
            },
            allowBlank: false,
        },
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Public Key'),
            labelWidth: 120,
            name: 'public_key',
            emptyText: gettext('base64-encoded WireGuard public key'),
            regex: /^[A-Za-z0-9+/]{43}=$/,
            regexText: gettext('WireGuard public key must be 44 base64 characters'),
            hidden: true,
            bind: {
                hidden: '{current.isPveNode}',
                disabled: '{current.isPveNode}',
            },
            allowBlank: false,
        },
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Endpoint'),
            emptyText: gettext('Host that peers connect to'),
            labelWidth: 120,
            name: 'endpoint',
            allowBlank: false,
        },
        {
            xtype: 'proxmoxintegerfield',
            fieldLabel: gettext('Endpoint Port'),
            emptyText: gettext('Default') + ': 51820',
            labelWidth: 120,
            name: 'endpoint_port',
            minValue: 1,
            maxValue: 65535,
            allowBlank: true,
            submitValue: false,
        },
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Allowed IPs'),
            emptyText: gettext('Destination CIDRs that route to this node, comma-separated'),
            labelWidth: 120,
            name: 'allowed_ips',
            cbind: {
                deleteEmpty: '{!isCreate}',
            },
            // TODO: implement proper list selection field that handles
            // converting from / to array
            setValue: function (value) {
                if (Ext.isArray(value)) {
                    value = value.join(', ');
                }

                return Ext.form.field.Text.prototype.setValue.call(this, value);
            },
            getSubmitValue: function () {
                let value = this.getValue();
                if (!value) {
                    return null;
                }
                let parts = value
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                return parts.length > 0 ? parts : null;
            },
        },
    ],

    combineEndpoint: function (endpoint, port) {
        let me = this;

        port = port || me.defaultEndpointPort;

        if (Proxmox.Utils.IP6_match.test(endpoint)) {
            endpoint = `[${endpoint}]`;
        }

        return `${endpoint}:${port}`;
    },

    splitEndpoint: function (endpoint) {
        let match = endpoint?.match(/^\[([^\]]+)\]:(\d+)$/) ?? endpoint?.match(/^([^:]+):(\d+)$/);
        if (!match) {
            return { endpoint };
        }

        return {
            endpoint: match[1],
            endpoint_port: Number(match[2]),
        };
    },

    getValues: function (dirtyOnly) {
        let me = this;

        let values = me.callParent([dirtyOnly]);
        let endpointField = me.down('[name=endpoint]');
        let portField = me.down('[name=endpoint_port]');

        if (!dirtyOnly || values.endpoint || portField.isDirty()) {
            values.endpoint = me.combineEndpoint(endpointField.getValue(), portField.getValue());
        }
        delete values.endpoint_port;

        return values;
    },

    loadAvailablePeers: async function () {
        let me = this;

        let response = await Proxmox.Async.api2({
            url: `/cluster/sdn/fabrics/node/${me.fabricId}`,
            method: 'GET',
        });

        return response.result.data.flatMap((node) => {
            let availablePeers = [];

            let peer = {
                type: node.role,
                endpoint: node.endpoint,
                node: node.node_id,
            };

            if (node.role === 'internal') {
                for (let iface of node.interfaces ?? []) {
                    let parsed_iface = PVE.Parser.parsePropertyString(iface);

                    let iface_peer = structuredClone(peer);
                    iface_peer.node_iface = parsed_iface.name;

                    availablePeers.push(iface_peer);
                }
            } else if (node.role === 'external') {
                availablePeers.push(peer);
            } else {
                throw `unknown node type: ${node.role}`;
            }

            return availablePeers;
        });
    },

    load: function () {
        let me = this;

        me.setLoading(gettext('Fetching Node Information'));

        Promise.all([me.loadNode(me.fabricId, me.nodeId), me.loadAvailablePeers()])
            .catch(Proxmox.Utils.alertResponseFailure)
            .then(([node, availablePeers]) => {
                me.interfaceSelector.setAvailablePeers(availablePeers);

                Ext.apply(node, me.splitEndpoint(node.endpoint));
                node.interfaces = node.interfaces ?? [];
                node.peers = node.peers ?? [];
                me.interfaceSelector.setNode(node);

                me.setValues(node);
            })
            .finally(() => {
                me.setLoading(false);
            });
    },

    getNodeSelectorConfig: function () {
        let me = this;
        let config = me.callParent();

        Ext.Object.merge(config, {
            store: {
                listeners: {
                    load: function (store) {
                        if (store.count() === 0) {
                            me.lookupReference('roleSelector').select('external');
                            me.lookupReference('nodeSelector').setDisabled(true);
                        }
                    },
                },
            },
        });

        return config;
    },

    getNodeSelector: function () {
        let me = this;

        let nodeSelector = me.callParent();
        nodeSelector.setDisabled(!me.isCreate);

        let roleSelector = Ext.create({
            xtype: 'combobox',
            name: 'role',
            labelWidth: 120,
            fieldLabel: gettext('Role'),
            editable: false,
            disabled: !me.isCreate,
            reference: 'roleSelector',
            value: 'internal',
            store: [
                ['internal', gettext('Internal (cluster member)')],
                ['external', gettext('External peer')],
            ],
            listeners: {
                change: function (_this, newValue) {
                    let isPveNode = newValue === 'internal';

                    me.getViewModel().set('current.isPveNode', isPveNode);

                    me.interfaceSelector.setHidden(!isPveNode);
                    me.interfaceSelector.setDisabled(!isPveNode);

                    me.lookupReference('nodeSelector').setDisabled(!me.isCreate || !isPveNode);
                    me.lookupReference('nodeSelector').setHidden(!isPveNode);
                },
            },
        });

        return Ext.create({
            xtype: 'inputpanel',
            items: [roleSelector, nodeSelector],
        });
    },
});
