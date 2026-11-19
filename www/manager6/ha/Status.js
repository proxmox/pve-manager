Ext.define('PVE.ha.Status', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveHAStatus',

    onlineHelp: 'chapter_ha_manager',
    layout: {
        type: 'vbox',
        align: 'stretch',
    },

    viewModel: {
        data: {
            haDisarmed: false,
            // set as soon as disarming HA was requested, not only once HA is fully disarmed
            haDisarmRequested: false,
            selectedLrmNode: null,
            // maintenance state of the selected LRM node
            maintenanceRequested: false,
        },
        formulas: {
            noMaintenanceAction: (get) =>
                !get('selectedLrmNode') || !Ext.state.Manager.get('GuiCap').dc['Sys.Modify'],
            // the CRM ignores requests to enable maintenance mode once disarming HA was requested
            noMaintenanceEnable: (get) => get('maintenanceRequested') || get('haDisarmRequested'),
        },
    },

    controller: {
        xclass: 'Ext.app.ViewController',

        handleDisarmButton: function (menuItem) {
            let me = this;
            let view = me.getView();

            let warn = Ext.String.format(
                gettext("Are you sure you want to disarm HA with resource mode '{0}'?"),
                menuItem.text,
            );

            let details = gettext(
                'While disarmed, HA does not protect your services. Failures during this period are not automatically recovered.',
            );

            Ext.Msg.confirm(
                gettext('Confirm'),
                warn + '<br><br>' + menuItem.details + '<br><br>' + details,
                function (btn) {
                    if (btn !== 'yes') {
                        return;
                    }
                    Proxmox.Utils.API2Request({
                        url: '/cluster/ha/status/disarm-ha',
                        params: { 'resource-mode': menuItem.mode },
                        method: 'POST',
                        success: function () {
                            let sv = view.query('pveHAStatusView')[0];
                            sv.isDisarmedPendingState = true;
                            sv.setPending(true);
                        },
                        failure: (response) => Ext.Msg.alert(gettext('Error'), response.htmlStatus),
                    });
                },
            );
        },

        updateMaintenanceState: function () {
            let me = this;
            let vm = me.getViewModel();
            let sv = me.getView().down('pveHAStatusView');
            let rec = sv.getSelection()[0];
            let isLrm = rec?.get('type') === 'lrm';

            vm.set('selectedLrmNode', isLrm ? rec.get('node') : null);
            vm.set('maintenanceRequested', isLrm && rec.get('maintenance-requested'));
        },

        handleMaintenanceButton: function (menuItem) {
            let me = this;
            let node = me.getViewModel().get('selectedLrmNode');
            if (!node) {
                return;
            }

            let msg;
            if (menuItem.maintenanceMode === 'disable') {
                msg = Ext.String.format(
                    gettext("Are you sure you want to disable maintenance mode for node '{0}'?"),
                    node,
                );
                if (me.getViewModel().get('haDisarmRequested')) {
                    msg +=
                        '<br><br>' +
                        Ext.String.format(
                            gettext(
                                "HA resources will be migrated back to node '{0}' once HA is re-armed.",
                            ),
                            node,
                        );
                }
            } else if (menuItem.maintenanceMode === 'enable') {
                msg = Ext.String.format(
                    gettext("Are you sure you want to enable maintenance mode for node '{0}'?"),
                    node,
                );
                msg +=
                    '<br><br>' +
                    gettext('HA resources on the node will be migrated to other nodes.');
            } else {
                throw `unknown maintenance mode '${menuItem.maintenanceMode}'`;
            }

            Ext.Msg.confirm(gettext('Confirm'), msg, function (btn) {
                if (btn !== 'yes') {
                    return;
                }
                Proxmox.Utils.API2Request({
                    url: `/nodes/${node}/maintenance`,
                    params: { 'maintenance-mode': menuItem.maintenanceMode },
                    method: 'PUT',
                    failure: (response) => Ext.Msg.alert(gettext('Error'), response.htmlStatus),
                });
            });
        },

        openCRSOptions: function () {
            Ext.create('PVE.form.CRSOptions', {
                autoShow: true,
                autoLoad: true,
            });
        },

        handleArmButton: function () {
            let me = this;
            let view = me.getView();

            Ext.Msg.confirm(
                gettext('Confirm'),
                gettext('Are you sure you want to arm HA?'),
                function (btn) {
                    if (btn !== 'yes') {
                        return;
                    }
                    Proxmox.Utils.API2Request({
                        url: '/cluster/ha/status/arm-ha',
                        method: 'POST',
                        success: function () {
                            let sv = view.query('pveHAStatusView')[0];
                            sv.isDisarmedPendingState = false;
                            sv.setPending(true);
                        },
                        failure: (response) => Ext.Msg.alert(gettext('Error'), response.htmlStatus),
                    });
                },
            );
        },
    },

    tbar: [
        {
            text: gettext('Arm HA'),
            iconCls: 'fa fa-link',
            bind: {
                disabled: '{!haDisarmed}',
            },
            handler: 'handleArmButton',
        },
        {
            text: gettext('Disarm HA'),
            iconCls: 'fa fa-unlink',
            bind: {
                disabled: '{haDisarmed}',
            },
            menu: [
                {
                    text: gettext('Freeze'),
                    details: gettext(
                        'This will freeze all services allowing no change to their operational state.',
                    ),
                    iconCls: 'fa fa-snowflake-o',
                    mode: 'freeze',
                    handler: 'handleDisarmButton',
                },
                {
                    text: gettext('Ignore'),
                    details: gettext(
                        'The HA stack will be completely bypassed when the operational state of a service changes.',
                    ),
                    iconCls: 'fa fa-eye-slash',
                    mode: 'ignore',
                    handler: 'handleDisarmButton',
                },
            ],
        },
        '-',
        {
            text: gettext('Node Maintenance'),
            iconCls: 'fa fa-wrench',
            bind: {
                disabled: '{noMaintenanceAction}',
            },
            menu: [
                {
                    text: gettext('Enable'),
                    iconCls: 'fa fa-wrench',
                    maintenanceMode: 'enable',
                    bind: {
                        disabled: '{noMaintenanceEnable}',
                    },
                    handler: 'handleMaintenanceButton',
                },
                {
                    text: gettext('Disable'),
                    iconCls: 'fa fa-check',
                    maintenanceMode: 'disable',
                    bind: {
                        disabled: '{!maintenanceRequested}',
                    },
                    handler: 'handleMaintenanceButton',
                },
            ],
        },
        '->',
        {
            text: gettext('CRS Settings'),
            iconCls: 'fa fa-cogs',
            tooltip: gettext('Cluster Resource Scheduling, configured under Datacenter > Options'),
            handler: 'openCRSOptions',
        },
    ],

    initComponent: function () {
        var me = this;

        me.rstore = Ext.create('Proxmox.data.ObjectStore', {
            interval: me.interval,
            model: 'pve-ha-status',
            storeid: 'pve-store-' + ++Ext.idSeed,
            groupField: 'type',
            proxy: {
                type: 'proxmox',
                url: '/api2/json/cluster/ha/status/current',
            },
        });

        me.items = [
            {
                xtype: 'pveHAStatusView',
                title: gettext('Status'),
                rstore: me.rstore,
                border: 0,
                collapsible: true,
                padding: '0 0 20 0',
                listeners: {
                    selectionchange: () => me.getController().updateMaintenanceState(),
                    hastatuschange: function (isDisarmed, armedState) {
                        let vm = me.getViewModel();
                        let sv = me.query('pveHAStatusView')[0];

                        vm.set('haDisarmed', isDisarmed);
                        vm.set('haDisarmRequested', ['disarming', 'disarmed'].includes(armedState));
                        me.getController().updateMaintenanceState();

                        if (sv.isDisarmedPendingState === null) {
                            return;
                        }

                        if (isDisarmed === sv.isDisarmedPendingState) {
                            sv.setPending(false);
                            sv.isDisarmedPendingState = null;
                        }
                    },
                },
            },
            {
                xtype: 'pveHAResourcesView',
                flex: 1,
                collapsible: true,
                title: gettext('Resources'),
                border: 0,
                rstore: me.rstore,
            },
        ];

        me.callParent();
        me.on('activate', me.rstore.startUpdate);
    },
});
