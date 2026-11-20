Ext.define('PVE.window.GuestIdentity', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveGuestIdentityWindow',

    title: gettext('Guest Identity'),
    width: 450,
    modal: true,
    resizable: false,
    bodyPadding: 10,

    layout: 'anchor',
    defaults: {
        anchor: '100%',
        labelWidth: 130,
    },

    // the parsed 'meta' property of the guest config
    meta: {},

    initComponent: function () {
        let me = this;

        let meta = me.meta;
        let renderTime = (seconds) =>
            Ext.isNumeric(seconds) ? PVE.Utils.render_timestamp_human_readable(seconds) : '';

        let fields = [
            {
                xtype: 'textfield',
                itemId: 'uid',
                fieldLabel: gettext('Unique ID'),
                value: meta.uid,
                editable: false,
            },
            {
                xtype: 'displayfield',
                itemId: 'rtime',
                fieldLabel: gettext('Registered'),
                value: renderTime(meta.rtime / 1000),
            },
            {
                xtype: 'displayfield',
                itemId: 'ctime',
                fieldLabel: gettext('Created'),
                value: renderTime(meta.ctime),
            },
            {
                xtype: 'displayfield',
                itemId: 'creation-qemu',
                fieldLabel: gettext('Created with QEMU'),
                value: meta['creation-qemu'],
            },
        ];
        me.items = fields.filter((field) => (field.value ?? '') !== '');

        me.callParent();
    },
});

Ext.define('PVE.panel.GuestIdentityInfo', {
    extend: 'Ext.container.Container',
    alias: 'widget.pveGuestIdentityInfo',

    hidden: true,
    layout: {
        type: 'hbox',
        align: 'middle',
    },

    items: [
        {
            xtype: 'pmxInfoWidget',
            flex: 1,
            iconCls: 'fa fa-id-card-o fa-fw',
            title: gettext('Unique ID'),
            printBar: false,
            textField: 'uid',
            // the status view only updates info widgets, so this one shows or hides the whole row
            renderer: function (uid) {
                this.up('pveGuestIdentityInfo').setHidden(!uid);
                return Ext.htmlEncode(uid);
            },
        },
        {
            xtype: 'button',
            iconCls: 'fa fa-info-circle',
            tooltip: gettext('Details'),
            ariaLabel: gettext('Details'),
            ui: 'default-toolbar',
            margin: '0 0 0 5',
            handler: function () {
                this.up('pveGuestIdentityInfo').showDetails();
            },
        },
    ],

    showDetails: async function () {
        let me = this;

        // a second click while loading would open a second window
        if (me.loadingDetails) {
            return;
        }

        let view = me.up('pmxStatusView');
        let { node, vmid, type } = view.pveSelNode.data;

        // no load mask, for this short request it only flashes over the whole status view
        me.loadingDetails = true;
        let response;
        try {
            response = await Proxmox.Async.api2({
                url: `/nodes/${node}/${type}/${vmid}/config`,
                method: 'GET',
            });
        } catch (error) {
            if (!me.destroyed) {
                Ext.Msg.alert(gettext('Error'), error.htmlStatus);
            }
            return;
        } finally {
            me.loadingDetails = false;
        }

        // another guest can be selected by now
        if (me.destroyed) {
            return;
        }

        Ext.create('PVE.window.GuestIdentity', {
            autoShow: true,
            meta: PVE.Parser.parsePropertyString(response.result.data.meta) ?? {},
        });
    },
});
