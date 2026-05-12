Ext.define('PVE.sdn.Fabric.Fabric.Edit', {
    extend: 'Proxmox.window.Edit',
    mixins: ['Proxmox.Mixin.CBind'],

    width: 400,

    fabricId: undefined,

    hasIpv4Support: true,
    hasIpv6Support: true,

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
            name: 'id',
            cbind: {
                disabled: '{!isCreate}',
            },
        },
    ],

    additionalItems: [],

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
                allowBlank: true,
                skipEmptyText: true,
                cbind: {
                    disabled: '{!isCreate}',
                    deleteEmpty: '{!isCreate}',
                },
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
                    allowBlank: true,
                    skipEmptyText: true,
                    cbind: {
                        disabled: '{!isCreate}',
                        deleteEmpty: '{!isCreate}',
                    },
                    listeners: {
                        change: function (textbox, value) {
                            let vm = textbox.up('window').getViewModel();
                            vm.set('showIpv6ForwardingHint', !!value);
                        },
                    },
                },
            );
        }

        me.items.push(...me.additionalItems);

        me.callParent();
    },
});
