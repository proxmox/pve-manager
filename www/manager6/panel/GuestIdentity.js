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

        let items = [
            {
                xtype: 'fieldcontainer',
                fieldLabel: gettext('Unique ID'),
                layout: 'hbox',
                items: [
                    {
                        xtype: 'textfield',
                        itemId: 'uid',
                        value: meta.uid ?? '',
                        emptyText: gettext('Assigned with the next configuration change'),
                        editable: false,
                        flex: 1,
                    },
                    {
                        xtype: 'button',
                        iconCls: 'fa fa-clipboard',
                        tooltip: gettext('Copy to Clipboard'),
                        ariaLabel: gettext('Copy to Clipboard'),
                        disabled: !meta.uid,
                        margin: '0 0 0 5',
                        handler: () => PVE.Utils.copyToClipboard(meta.uid),
                    },
                ],
            },
        ];

        let fields = [
            {
                itemId: 'rtime',
                fieldLabel: gettext('Registered'),
                value: Ext.isNumeric(meta.rtime) ? renderTime(meta.rtime / 1000) : '',
                autoEl: {
                    tag: 'div',
                    'data-qtip': gettext(
                        'Time the guest was registered in this cluster, for example by creation, a restore to a free VMID, or a migration from another cluster.',
                    ),
                },
            },
            {
                itemId: 'ctime',
                fieldLabel: gettext('Created'),
                value: renderTime(meta.ctime),
            },
            {
                itemId: 'creation-qemu',
                fieldLabel: gettext('Created with QEMU'),
                value: meta['creation-qemu'],
            },
        ];

        for (const field of fields) {
            if ((field.value ?? '') !== '') {
                items.push({
                    xtype: 'displayfield',
                    htmlEncode: true,
                    ...field,
                });
            }
        }

        me.items = items;

        me.callParent();
    },
});

Ext.define('PVE.panel.GuestIdentityTool', {
    extend: 'Ext.panel.Tool',
    alias: 'widget.pveGuestIdentityTool',

    glyph: 'xf05a@FontAwesome', // fa-info-circle
    tooltip: gettext('Guest Identity'),
    lastUid: '',
    style: {
        // keep room from the right-aligned LXC distro label
        paddingLeft: '5px',
    },

    callback: function (view, tool) {
        tool.showDetails(view);
    },

    onAdded: function () {
        let me = this;
        me.callParent(arguments);

        let view = me.toolOwner;
        let rstore = view.getStore();
        me.mon(rstore, 'load', (_store, _records, success) => {
            if (success) {
                me.updateFromStatus(view);
            }
        });
        if (rstore.getCount() > 0) {
            me.updateFromStatus(view);
        }
    },

    updateFromStatus: function (view) {
        let me = this;
        let uid = view.getRecordValue('uid') || '';
        if (uid === me.lastUid) {
            return;
        }
        me.lastUid = uid;
        me.setTooltip(
            uid
                ? Ext.String.format(gettext('Guest Identity ({0})'), Ext.htmlEncode(uid))
                : gettext('Guest Identity'),
        );
    },

    showDetails: async function (view) {
        let me = this;

        // a second click while loading would open a second window
        if (me.loadingDetails) {
            return;
        }

        let { node, vmid, type, name } = view.pveSelNode.data;
        let guestName = view.getRecordValue('name') || name;

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

        let guestIdentifier = PVE.Utils.getFormattedGuestIdentifier(vmid, guestName);
        Ext.create('PVE.window.GuestIdentity', {
            autoShow: true,
            title: `${gettext('Guest Identity')}: ${Ext.htmlEncode(guestIdentifier)}`,
            meta: PVE.Parser.parsePropertyString(response.result.data.meta) ?? {},
        });
    },
});
