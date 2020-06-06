Ext.define('PVE.window.Migrate', {
    extend: 'Ext.window.Window',

    vmtype: undefined,
    nodename: undefined,
    vmid: undefined,
    maxHeight: 450,

    viewModel: {
	data: {
	    vmid: undefined,
	    nodename: undefined,
	    vmtype: undefined,
	    running: false,
	    qemu: {
		onlineHelp: 'qm_migration',
		commonName: 'VM'
	    },
	    lxc: {
		onlineHelp: 'pct_migration',
		commonName: 'CT'
	    },
	    migration: {
		possible: true,
		preconditions: [],
		'with-local-disks': 0,
		mode: undefined,
		allowedNodes: undefined,
		overwriteLocalResourceCheck: false,
		hasLocalResources: false
	    }

	},

	formulas: {
	    setMigrationMode: function(get) {
		if (get('running')){
		    if (get('vmtype') === 'qemu') {
			return gettext('Online');
		    } else {
			return gettext('Restart Mode');
		    }
		} else {
		    return gettext('Offline');
		}
	    },
	    setStorageselectorHidden: function(get) {
		    if (get('migration.with-local-disks') && get('running')) {
			return false;
		    } else {
			return true;
		    }
	    },
	    setLocalResourceCheckboxHidden: function(get) {
		if (get('running') || !get('migration.hasLocalResources') ||
		    Proxmox.UserName !== 'root@pam') {
		    return true;
		} else {
		    return false;
		}
	    }
	}
    },

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    'panel[reference=formPanel]': {
		validityChange: function(panel, isValid) {
		    this.getViewModel().set('migration.possible', isValid);
		    this.checkMigratePreconditions();
		}
	    }
	},

	init: function(view) {
	    var me = this,
		vm = view.getViewModel();

	    if (!view.nodename) {
		throw "missing custom view config: nodename";
	    }
	    vm.set('nodename', view.nodename);

	    if (!view.vmid) {
		throw "missing custom view config: vmid";
	    }
	    vm.set('vmid', view.vmid);

	    if (!view.vmtype) {
		throw "missing custom view config: vmtype";
	    }
	    vm.set('vmtype', view.vmtype);


	    view.setTitle(
		Ext.String.format('{0} {1} {2}', gettext('Migrate'), vm.get(view.vmtype).commonName, view.vmid)
	    );
	    me.lookup('proxmoxHelpButton').setHelpConfig({
		onlineHelp: vm.get(view.vmtype).onlineHelp
	    });
	    me.checkMigratePreconditions();
	    me.lookup('formPanel').isValid();

	},

	onTargetChange: function (nodeSelector) {
	    //Always display the storages of the currently seleceted migration target
	    this.lookup('pveDiskStorageSelector').setNodename(nodeSelector.value);
	    this.checkMigratePreconditions();
	},

	startMigration: function() {
	    var me = this,
		view = me.getView(),
		vm = me.getViewModel();

	    var values = me.lookup('formPanel').getValues();
	    var params = {
		target: values.target
	    };

	    if (vm.get('migration.mode')) {
		params[vm.get('migration.mode')] = 1;
	    }
	    if (vm.get('migration.with-local-disks')) {
		params['with-local-disks'] = 1;
	    }
	    //only submit targetstorage if vm is running, storage migration to different storage is only possible online
	    if (vm.get('migration.with-local-disks') && vm.get('running')) {
		params.targetstorage = values.targetstorage;
	    }

	    if (vm.get('migration.overwriteLocalResourceCheck')) {
		params['force'] = 1;
	    }

	    Proxmox.Utils.API2Request({
		params: params,
		url: '/nodes/' + vm.get('nodename') + '/' + vm.get('vmtype') + '/' + vm.get('vmid') + '/migrate',
		waitMsgTarget: view,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
		success: function(response, options) {
		    var upid = response.result.data;
		    var extraTitle = Ext.String.format(' ({0} ---> {1})', vm.get('nodename'), params.target);

		    Ext.create('Proxmox.window.TaskViewer', {
			upid: upid,
			extraTitle: extraTitle
		    }).show();

		    view.close();
		}
	    });

	},

	checkMigratePreconditions: function(resetMigrationPossible) {
	    var me = this,
		vm = me.getViewModel();

	    var vmrec = PVE.data.ResourceStore.findRecord('vmid', vm.get('vmid'),
			0, false, false, true);
	    if (vmrec && vmrec.data && vmrec.data.running) {
		vm.set('running', true);
	    }

	    if (vm.get('vmtype') === 'qemu') {
		me.checkQemuPreconditions(resetMigrationPossible);
	    } else {
		me.checkLxcPreconditions(resetMigrationPossible);
	    }
	    me.lookup('pveNodeSelector').disallowedNodes = [vm.get('nodename')];

	    // Only allow nodes where the local storage is available in case of offline migration
	    // where storage migration is not possible
	    me.lookup('pveNodeSelector').allowedNodes = vm.get('migration.allowedNodes');

	    me.lookup('formPanel').isValid();

	},

	checkQemuPreconditions: function(resetMigrationPossible) {
	    var me = this,
		vm = me.getViewModel(),
		migrateStats;

	    if (vm.get('running')) {
		vm.set('migration.mode', 'online');
	    }

	    Proxmox.Utils.API2Request({
		url: '/nodes/' + vm.get('nodename') + '/' + vm.get('vmtype') + '/' + vm.get('vmid') + '/migrate',
		method: 'GET',
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		},
		success: function(response, options) {
		    migrateStats = response.result.data;
		    if (migrateStats.running) {
			vm.set('running', true);
		    }
		    // Get migration object from viewmodel to prevent
		    // to many bind callbacks
		    var migration = vm.get('migration');
		    if (resetMigrationPossible) migration.possible = true;
		    migration.preconditions = [];

		    if (migrateStats.allowed_nodes) {
			migration.allowedNodes = migrateStats.allowed_nodes;
			var target = me.lookup('pveNodeSelector').value;
			if (target.length && !migrateStats.allowed_nodes.includes(target)) {
			    let disallowed = migrateStats.not_allowed_nodes[target];
			    let missing_storages = disallowed.unavailable_storages.join(', ');

			    migration.possible = false;
			    migration.preconditions.push({
				text: 'Storage (' + missing_storages + ') not available on selected target. ' +
				  'Start VM to use live storage migration or select other target node',
				severity: 'error'
			    });
			}
		    }

		    if (migrateStats.local_resources.length) {
			migration.hasLocalResources = true;
			if(!migration.overwriteLocalResourceCheck || vm.get('running')){
			    migration.possible = false;
			    migration.preconditions.push({
				text: Ext.String.format('Can\'t migrate VM with local resources: {0}',
				migrateStats.local_resources.join(', ')),
				severity: 'error'
			    });
			} else {
			    migration.preconditions.push({
				text: Ext.String.format('Migrate VM with local resources: {0}. ' +
				'This might fail if resources aren\'t available on the target node.',
				migrateStats.local_resources.join(', ')),
				severity: 'warning'
			    });
			}
		    }

		    if (migrateStats.local_disks.length) {

			migrateStats.local_disks.forEach(function (disk) {
			    if (disk.cdrom && disk.cdrom === 1) {
				if (disk.volid.includes('vm-'+vm.get('vmid')+'-cloudinit')) {
				    if (migrateStats.running) {
					migration.possible = false;
					migration.preconditions.push({
					     text: "Can't live migrate VM with local cloudinit disk, use shared storage instead",
					     severity: 'error'
					});
				    } else {
					return;
				    }
				} else {
				    migration.possible = false;
				    migration.preconditions.push({
					text: "Can't migrate VM with local CD/DVD",
					severity: 'error'
				    });
				}
			    } else {
				migration['with-local-disks'] = 1;
				migration.preconditions.push({
				    text:'Migration with local disk might take long: ' + disk.volid
					+' (' + PVE.Utils.render_size(disk.size) + ')',
				    severity: 'warning'
				});
			    }
			});

		    }

		    vm.set('migration', migration);

		}
	    });
	},
	checkLxcPreconditions: function(resetMigrationPossible) {
	    var me = this,
		vm = me.getViewModel();
	    if (vm.get('running')) {
		vm.set('migration.mode', 'restart');
	    }
	}


    },

    width: 600,
    modal: true,
    layout: {
	type: 'vbox',
	align: 'stretch'
    },
    border: false,
    items: [
	{
	    xtype: 'form',
	    reference: 'formPanel',
	    bodyPadding: 10,
	    border: false,
	    layout: {
		type: 'column'
	    },
	    items: [
		{
		    xtype: 'container',
		    columnWidth: 0.5,
		    items: [{
			xtype: 'displayfield',
			name: 'source',
			fieldLabel: gettext('Source node'),
			bind: {
			    value: '{nodename}'
			}
		    },
		    {
			xtype: 'displayfield',
			reference: 'migrationMode',
			fieldLabel: gettext('Mode'),
			bind: {
			    value: '{setMigrationMode}'
			}
		    }]
		},
		{
		    xtype: 'container',
		    columnWidth: 0.5,
		    items: [{
			xtype: 'pveNodeSelector',
			reference: 'pveNodeSelector',
			name: 'target',
			fieldLabel: gettext('Target node'),
			allowBlank: false,
			disallowedNodes: undefined,
			onlineValidator: true,
			listeners: {
			    change: 'onTargetChange'
			}
		    },
		    {
			    xtype: 'pveStorageSelector',
			    reference: 'pveDiskStorageSelector',
			    name: 'targetstorage',
			    fieldLabel: gettext('Target storage'),
			    storageContent: 'images',
			    bind: {
				hidden: '{setStorageselectorHidden}'
			    }
		    },
		    {
			xtype: 'proxmoxcheckbox',
			name: 'overwriteLocalResourceCheck',
			fieldLabel: gettext('Force'),
			autoEl: {
			    tag: 'div',
			    'data-qtip': 'Overwrite local resources unavailable check'
			},
			bind: {
			    hidden: '{setLocalResourceCheckboxHidden}',
			    value: '{migration.overwriteLocalResourceCheck}'
			},
			listeners: {
			    change: {fn: 'checkMigratePreconditions', extraArg: true}
			}
		}]
		}
	    ]
	},
	{
	    xtype: 'gridpanel',
	    reference: 'preconditionGrid',
	    selectable: false,
	    flex: 1,
	    columns: [{
		text: '',
		dataIndex: 'severity',
		renderer: function(v) {
		    switch (v) {
			case 'warning':
			    return '<i class="fa fa-exclamation-triangle warning"></i> ';
			case 'error':
			    return '<i class="fa fa-times critical"></i>';
			default:
			    return v;
		    }
		},
		width: 35
	    },
	    {
		text: 'Info',
		dataIndex: 'text',
		cellWrap: true,
		flex: 1
	    }],
	    bind: {
		hidden: '{!migration.preconditions.length}',
		store: {
		    fields: ['severity','text'],
		    data: '{migration.preconditions}'
		}
	    }
	}

    ],
    buttons: [
	{
	    xtype: 'proxmoxHelpButton',
	    reference: 'proxmoxHelpButton',
	    onlineHelp: 'pct_migration',
	    listenToGlobalEvent: false,
	    hidden: false
	},
	'->',
	{
	    xtype: 'button',
	    reference: 'submitButton',
	    text: gettext('Migrate'),
	    handler: 'startMigration',
	    bind: {
		disabled: '{!migration.possible}'
	    }
	}
    ]
});
