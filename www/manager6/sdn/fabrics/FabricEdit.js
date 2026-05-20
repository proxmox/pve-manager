Ext.define('PVE.sdn.Fabric.Fabric.Edit', {
    extend: 'Proxmox.window.Edit',
    mixins: ['Proxmox.Mixin.CBind'],

    width: 400,

    fabricId: undefined,

    hasIpv4Support: true,
    hasIpv6Support: true,

    disableIpPrefixEdit: false,

    baseUrl: '/cluster/sdn/fabrics/fabric',

    viewModel: {
        data: {
            showIpv6ForwardingHint: false,
        },
    },

    items: [
        {
            xtype: 'textfield',
            name: 'digest',
            hidden: true,
            allowBlank: true,
        },
        {
            xtype: 'proxmoxtextfield',
            fieldLabel: gettext('Name'),
            labelWidth: 120,
            maxLength: 8,
            allowBlank: false,
            name: 'id',
            cbind: {
                disabled: '{!isCreate}',
            },
        },
    ],

    additionalItems: [],
    additionalAdvancedItems: [],
    additionalTabs: [],

    initComponent: function () {
        let me = this;

        me.isCreate = me.fabricId === undefined;
        me.autoLoad = !me.isCreate;
        me.method = me.isCreate ? 'POST' : 'PUT';

        if (!me.isCreate) {
            me.url = `${me.baseUrl}/${me.fabricId}`;
        } else {
            me.url = me.baseUrl;
        }

        if (me.hasIpv4Support) {
            me.items.push({
                xtype: 'proxmoxtextfield',
                fieldLabel: gettext('IPv4 Prefix'),
                labelWidth: 120,
                name: 'ip_prefix',
                disabled: me.disableIpPrefixEdit,
                allowBlank: me.hasIpv6Support,
                vtype: 'IPCIDRAddress',
                skipEmptyText: true,
                deleteEmpty: !me.isCreate,
            });
        }

        if (me.hasIpv6Support) {
            me.items.push(
                {
                    xtype: 'displayfield',
                    value: 'To make IPv6 fabrics work, enable global IPv6 forwarding on all nodes. Click on the Help button for more details.',
                    bind: {
                        hidden: '{!showIpv6ForwardingHint}',
                    },
                    userCls: 'pmx-hint',
                },
                {
                    xtype: 'proxmoxtextfield',
                    fieldLabel: gettext('IPv6 Prefix'),
                    labelWidth: 120,
                    name: 'ip6_prefix',
                    disabled: me.disableIpPrefixEdit,
                    allowBlank: true,
                    vtype: 'IP6CIDRAddress',
                    skipEmptyText: true,
                    deleteEmpty: !me.isCreate,
                    listeners: {
                        change: function (textbox, value) {
                            let vm = textbox.up('window').getViewModel();
                            vm.set('showIpv6ForwardingHint', !!value);
                        },
                    },
                },
            );
        }

        if (me.additionalTabs.length > 0) {
            let items = [...me.items, ...me.additionalItems];

            let panelConfig = {
                title: gettext('Fabric'),
                items,
            };
            if (me.additionalAdvancedItems.length > 0) {
                panelConfig.advancedItems = me.additionalAdvancedItems;
            }

            let iPanel = Ext.create('Proxmox.panel.InputPanel', panelConfig);

            me.bodyPadding = 0;

            me.items = [
                {
                    xtype: 'tabpanel',
                    bodyPadding: 10,
                    items: [iPanel, ...me.additionalTabs],
                },
            ];
        } else {
            me.items.push(...me.additionalItems, ...me.additionalAdvancedItems);
        }

        me.callParent();
    },
});
