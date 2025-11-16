Ext.define('PVE.dc.CmdMenu', {
    extend: 'Ext.menu.Menu',
    xtype: 'datacenterCmdMenu',

    showSeparator: false,

    items: [
        {
            text: gettext('Bulk Start'),
            itemId: 'bulkstart',
            iconCls: 'fa fa-fw fa-play',
            handler: function () {
                Ext.create('PVE.window.BulkAction', {
                    autoShow: true,
                    vmsAsArray: true,
                    title: gettext('Bulk Start'),
                    btnText: gettext('Start'),
                    action: 'start',
                });
            },
        },
        {
            text: gettext('Bulk Shutdown'),
            itemId: 'bulkstop',
            iconCls: 'fa fa-fw fa-stop',
            handler: function () {
                Ext.create('PVE.window.BulkAction', {
                    autoShow: true,
                    vmsAsArray: true,
                    title: gettext('Bulk Shutdown'),
                    btnText: gettext('Shutdown'),
                    action: 'shutdown',
                });
            },
        },
        {
            text: gettext('Bulk Suspend'),
            itemId: 'bulksuspend',
            iconCls: 'fa fa-fw fa-download',
            handler: function () {
                Ext.create('PVE.window.BulkAction', {
                    autoShow: true,
                    vmsAsArray: true,
                    title: gettext('Bulk Suspend'),
                    btnText: gettext('Suspend'),
                    action: 'suspend',
                });
            },
        },
        {
            text: gettext('Bulk Migrate'),
            itemId: 'bulkmigrate',
            iconCls: 'fa fa-fw fa-send-o',
            handler: function () {
                Ext.create('PVE.window.BulkAction', {
                    autoShow: true,
                    vmsAsArray: true,
                    title: gettext('Bulk Migrate'),
                    btnText: gettext('Migrate'),
                    action: 'migrate',
                });
            },
        },
    ],

    initComponent: function () {
        let me = this;

        me.title = gettext('Datacenter');
        if (PVE.ClusterName?.length) {
            me.title += ` (${PVE.ClusterName})`;
            me.minWidth = 220;
        }

        me.callParent();

        let caps = Ext.state.Manager.get('GuiCap');

        if (!caps.vms['VM.Migrate']) {
            me.getComponent('bulkmigrate').setDisabled(true);
        }
        if (!caps.vms['VM.PowerMgmt']) {
            me.getComponent('bulkstart').setDisabled(true);
            me.getComponent('bulkstop').setDisabled(true);
            me.getComponent('bulksuspend').setDisabled(true);
        }
        if (PVE.Utils.isStandaloneNode()) {
            me.getComponent('bulkmigrate').setVisible(false);
        }
    },
});
