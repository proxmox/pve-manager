Ext.define('PVE.ceph.CephInstallWizardInfo', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveCephInstallWizardInfo',

    html: `<h3>Ceph?</h3>
    <blockquote cite="https://ceph.com/"><p>"<b>Ceph</b> is a unified,
    distributed storage system designed for excellent performance, reliability
    and scalability."</p></blockquote>
    <p>
    <b>Ceph</b> is currently <b>not installed</b> on this node, click on the
    next button below to start the installation. This wizard will guide you
    through the necessary steps, after the initial installation you will be
    offered to create an initial configuration. The configuration step is only
    needed once per cluster and will be skipped if a config is already present.
    </p>
    <p>
    Please take a look at our documentation, by clicking the help button below,
    before starting the installation, if you want to gain deeper knowledge about
    Ceph visit <a target="_blank" href="http://docs.ceph.com/docs/master/">ceph.com</a>.
    </p>`,
});

Ext.define('PVE.ceph.CephInstallWizard', {
	extend: 'PVE.window.Wizard',
	alias: 'widget.pveCephInstallWizard',
	mixins: ['Proxmox.Mixin.CBind'],

	resizable: false,
	nodename: undefined,

	viewModel: {
	    data: {
		nodename: '',
		configuration: true,
		isInstalled: false,
	    }
	},
	cbindData: {
	    nodename: undefined
	},

	title: gettext('Setup'),
	navigateNext: function() {
	    var tp = this.down('#wizcontent');
	    var atab = tp.getActiveTab();

	    var next = tp.items.indexOf(atab) + 1;
	    var ntab = tp.items.getAt(next);
	    if (ntab) {
		ntab.enable();
		tp.setActiveTab(ntab);
	    }
	},
	setInitialTab: function (index) {
	    var tp = this.down('#wizcontent');
	    var initialTab = tp.items.getAt(index);
	    initialTab.enable();
	    tp.setActiveTab(initialTab);
	},
	onShow: function() {
		this.callParent(arguments);
		var isInstalled = this.getViewModel().get('isInstalled');
		if (isInstalled) {
		    this.getViewModel().set('configuration', false);
		    this.setInitialTab(2);
		}
	},
	items: [
	    {
		xtype: 'panel',
		title: gettext('Info'),
		border: false,
		bodyBorder: false,
		onlineHelp: 'chapter_pveceph',
		layout: {
		    type: 'vbox',
		    align: 'stretch',
		},
		defaults: {
		    border: false,
		    bodyBorder: false,
		},
		items: [
		    {
			xtype: 'pveCephInstallWizardInfo',
		    },
		],
		listeners: {
		    activate: function() {
			// notify owning container that it should display a help button
			if (this.onlineHelp) {
			    Ext.GlobalEvents.fireEvent('proxmoxShowHelp', this.onlineHelp);
			}
			this.up('pveCephInstallWizard').down('#back').hide(true);
			this.up('pveCephInstallWizard').down('#next').setText(gettext('Start installation'));
		    },
		    deactivate: function() {
			if (this.onlineHelp) {
			    Ext.GlobalEvents.fireEvent('proxmoxHideHelp', this.onlineHelp);
			}
			this.up('pveCephInstallWizard').down('#next').setText(gettext('Next'));
		    }
		}
	    },
	    {
		title: gettext('Installation'),
		xtype: 'panel',
		layout: 'fit',
		cbind:{
		    nodename: '{nodename}'
		},
		viewModel: {}, // needed to inherit parent viewModel data
		listeners: {
		    afterrender: function() {
			var me = this;
			if (this.getViewModel().get('isInstalled')) {
			    this.mask("Ceph is already installed, click next to create your configuration.",['pve-static-mask']);
			} else {
			    me.down('pveNoVncConsole').fireEvent('activate');
			}
		    },
		    activate: function() {
			var me = this;
			var nodename = me.nodename;
			me.updateStore = Ext.create('Proxmox.data.UpdateStore', {
				storeid: 'ceph-status-' + nodename,
				interval: 1000,
				proxy: {
				    type: 'proxmox',
				    url: '/api2/json/nodes/' + nodename + '/ceph/status'
				},
				listeners: {
				    load: function(rec, response, success, operation) {

					if (success) {
					    me.updateStore.stopUpdate();
					    me.down('textfield').setValue('success');
					} else if (operation.error.statusText.match("not initialized", "i")) {
					    me.updateStore.stopUpdate();
					    me.up('pveCephInstallWizard').getViewModel().set('configuration',false);
					    me.down('textfield').setValue('success');
					} else if (operation.error.statusText.match("rados_connect failed", "i")) {
					    me.updateStore.stopUpdate();
					    me.up('pveCephInstallWizard').getViewModel().set('configuration',true);
					    me.down('textfield').setValue('success');
					} else if (!operation.error.statusText.match("not installed", "i")) {
					    Proxmox.Utils.setErrorMask(me, operation.error.statusText);
					}
				    }
				}
			});
			me.updateStore.startUpdate();
		    },
		    destroy: function() {
			var me = this;
			if (me.updateStore) {
			    me.updateStore.stopUpdate();
			}
		    }
		},
		items: [
		    {
			itemId: 'jsconsole',
			consoleType: 'cmd',
			xtermjs: true,
			xtype: 'pveNoVncConsole',
			cbind:{
			    nodename: '{nodename}'
			},
			cmd: 'ceph_install'
		    },
		    {
			xtype: 'textfield',
			name: 'installSuccess',
			value: '',
			allowBlank: false,
			submitValue: false,
			hidden: true
		    }
		]
	    },
	    {
		xtype: 'inputpanel',
		title: gettext('Configuration'),
		onlineHelp: 'chapter_pveceph',
		cbind: {
		    nodename: '{nodename}'
		},
		viewModel: {
		    data: {
			replicas: undefined,
			minreplicas: undefined
		    }
		},
		listeners: {
		    activate: function() {
			this.up('pveCephInstallWizard').down('#submit').setText(gettext('Next'));
		    },
		    beforeshow: function() {
			if (this.up('pveCephInstallWizard').getViewModel().get('configuration')) {
			    this.mask("Configuration already initialized",['pve-static-mask']);
			} else {
			    this.unmask();
			}
		    },
		    deactivate: function() {
			this.up('pveCephInstallWizard').down('#submit').setText(gettext('Finish'));
		    }
		},
		column1: [
		    {
			xtype: 'displayfield',
			value: gettext('Ceph cluster configuration') + ':'
		    },
		    {
			xtype: 'proxmoxNetworkSelector',
			name: 'network',
			value: '',
			fieldLabel: 'Public Network IP/CIDR',
			bind: {
			    allowBlank: '{configuration}'
			},
			cbind: {
			    nodename: '{nodename}'
			}
		    },
		    {
			xtype: 'proxmoxNetworkSelector',
			name: 'cluster-network',
			fieldLabel: 'Cluster Network IP/CIDR',
			allowBlank: true,
			autoSelect: false,
			emptyText: gettext('Same as Public Network'),
			cbind: {
			    nodename: '{nodename}'
			}
		    }
		    // FIXME: add hint about cluster network and/or reference user to docs??
		],
		column2: [
		    {
			xtype: 'displayfield',
			value: gettext('First Ceph monitor') + ':'
		    },
		    {
			xtype: 'pveNodeSelector',
			fieldLabel: gettext('Monitor node'),
			name: 'mon-node',
			selectCurNode: true,
			allowBlank: false
		    },
		    {
			xtype: 'displayfield',
			value: gettext('Additional monitors are recommended. They can be created at any time in the Monitor tab.'),
			userCls: 'pmx-hint'
		    }
		],
		advancedColumn1: [
		    {
			xtype: 'numberfield',
			name: 'size',
			fieldLabel: 'Number of replicas',
			bind: {
			    value: '{replicas}'
			},
			maxValue: 7,
			minValue: 2,
			emptyText: '3'
		    },
		    {
			xtype: 'numberfield',
			name: 'min_size',
			fieldLabel: 'Minimum replicas',
			bind: {
			    maxValue: '{replicas}',
			    value: '{minreplicas}'
			},
			minValue: 2,
			maxValue: 3,
			setMaxValue: function(value) {
			    this.maxValue = Ext.Number.from(value, 2);
			    // allow enough to avoid split brains with max 'size', but more makes simply no sense
			    if (this.maxValue > 4) {
				this.maxValue = 4;
			    }
			    this.toggleSpinners();
			    this.validate();
			},
			emptyText: '2'
		    }
		],
		onGetValues: function(values) {
		    ['cluster-network', 'size', 'min_size'].forEach(function(field) {
			if (!values[field]) {
			    delete values[field];
			}
		    });
		    return values;
		},
		onSubmit: function() {
		    var me = this;
		    if (!this.up('pveCephInstallWizard').getViewModel().get('configuration')) {
			var wizard = me.up('window');
			var kv = wizard.getValues();
			delete kv['delete'];
			var monNode = kv['mon-node'];
			delete kv['mon-node'];
			var nodename = me.nodename;
			delete kv.nodename;
			Proxmox.Utils.API2Request({
			    url: '/nodes/' + nodename + '/ceph/init',
			    waitMsgTarget: wizard,
			    method: 'POST',
			    params: kv,
			    success: function() {
				Proxmox.Utils.API2Request({
				    url: '/nodes/' + monNode + '/ceph/mon/' + monNode,
				    waitMsgTarget: wizard,
				    method: 'POST',
				    success: function() {
					me.up('pveCephInstallWizard').navigateNext();
				    },
				    failure: function(response, opts) {
					Ext.Msg.alert(gettext('Error'), response.htmlStatus);
				    }
				});
			    },
			    failure: function(response, opts) {
				Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			    }
			});

		    } else {
			me.up('pveCephInstallWizard').navigateNext();
		    }
		}
	    },
	    {
		title: gettext('Success'),
		xtype: 'panel',
		border: false,
		bodyBorder: false,
		onlineHelp: 'pve_ceph_install',
		html: '<h3>Installation successful!</h3>'+
		'<p>The basic installation and configuration is completed, depending on your setup some of the following steps are required to start using Ceph:</p>'+
		    '<ol><li>Install Ceph on other nodes</li>'+
		    '<li>Create additional Ceph Monitors</li>'+
		    '<li>Create Ceph OSDs</li>'+
		    '<li>Create Ceph Pools</li></ol>'+
		'<p>To learn more click on the help button below.</p>',
		listeners: {
		    activate: function() {
			// notify owning container that it should display a help button
			if (this.onlineHelp) {
			    Ext.GlobalEvents.fireEvent('proxmoxShowHelp', this.onlineHelp);
			}

			var tp = this.up('#wizcontent');
			var idx = tp.items.indexOf(this)-1;
			for(;idx >= 0;idx--) {
			    var nc = tp.items.getAt(idx);
			    if (nc) {
				nc.disable();
			    }
			}
		    },
		    deactivate: function() {
			if (this.onlineHelp) {
			    Ext.GlobalEvents.fireEvent('proxmoxHideHelp', this.onlineHelp);
			}
		    }
		},
		onSubmit: function() {
		    var wizard = this.up('pveCephInstallWizard');
		    wizard.close();
		}
	    }
	]
    });
