Ext.define('PVE.storage.StatusView', {
    extend: 'Proxmox.panel.StatusView',
    alias: 'widget.pveStorageStatusView',

    height: 230,
    title: gettext('Status'),

    layout: {
        type: 'vbox',
        align: 'stretch',
    },

    defaults: {
        xtype: 'pmxInfoWidget',
        padding: '0 30 5 30',
    },
    items: [
        {
            xtype: 'box',
            height: 30,
        },
        {
            itemId: 'enabled',
            title: gettext('Enabled'),
            printBar: false,
            textField: 'disabled',
            renderer: Proxmox.Utils.format_neg_boolean,
        },
        {
            itemId: 'active',
            title: gettext('Active'),
            printBar: false,
            textField: 'active',
            renderer: Proxmox.Utils.format_boolean,
        },
        {
            itemId: 'content',
            title: gettext('Content'),
            printBar: false,
            textField: 'content',
            renderer: PVE.Utils.format_content_types,
        },
        {
            itemId: 'type',
            title: gettext('Type'),
            printBar: false,
            textField: 'type',
            renderer: function (type) {
                return this.up('pveStorageStatusView').renderStorageType(type);
            },
        },
        {
            xtype: 'box',
            height: 10,
        },
        {
            itemId: 'usage',
            title: gettext('Usage'),
            valueField: 'used',
            maxField: 'total',
            renderer: (val, max) => {
                if (max === undefined) {
                    return val;
                }
                return Proxmox.Utils.render_size_usage(val, max, true);
            },
        },
    ],

    renderStorageType: function (type) {
        let me = this;

        me.displayNames ??= {};
        if (type && !PVE.Utils.storageSchema[type] && !Object.hasOwn(me.displayNames, type)) {
            me.displayNames[type] = undefined;
            Proxmox.Utils.API2Request({
                url: `/plugins/storage/plugin/${encodeURIComponent(type)}`,
                method: 'GET',
                // the type is shown as is if the plugin is not available on this node
                autoErrorAlert: false,
                // shown by the next periodic update of the status
                success: ({ result }) => {
                    me.displayNames[type] = result.data['display-name'];
                },
            });
        }

        return Ext.htmlEncode(me.displayNames[type] || PVE.Utils.format_storage_type(type));
    },

    updateTitle: function () {
        // nothing
    },
});
