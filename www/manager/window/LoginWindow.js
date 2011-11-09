Ext.define('PVE.window.LoginWindow', {
    extend: 'Ext.window.Window',
    requires: ['PVE.form.RealmComboBox'],

    // private
    onLogon: function() {
	var me = this;

	var form = me.getComponent(0).getForm();

	if(form.isValid()){
            me.el.mask('Please wait...', 'x-mask-loading');

	    form.submit({
		failure: function(f, resp){
		    me.el.unmask();
		    Ext.MessageBox.alert('Failure', "Login failed. Please try again", function() {
			var uf = form.findField('username');
			uf.focus(true, true);
		    });
		},
		success: function(f, resp){
		    me.el.unmask();
		    
		    var handler = me.handler || Ext.emptyFn;
		    handler.call(me, resp.result.data);
		    me.close();
		}
	    });
	}
    },

    initComponent: function() {
	var me = this;

	Ext.apply(me, {
	    width: 400,
	    modal: true,
	    border: false,
	    draggable: true,
	    closable: false,
	    resizable: false,
	    layout: 'auto',
	    title: 'Proxmox VE Login',

	    items: [{
		xtype: 'form',
		frame: true,
		url: '/api2/extjs/access/ticket',

		fieldDefaults: {
		    labelWidth: 70,
		    labelAlign: 'right'
		},

		defaults: {
		    anchor: '-5',
		    allowBlank: false
		},
		
		items: [
		    { 
			xtype: 'textfield', 
			fieldLabel: 'User name', 
			name: 'username',
			blankText: "Enter your user name",
			listeners: {
			    afterrender: function(f) {
				// Note: only works if we pass delay 1000
				f.focus(true, 1000);
			    },
			    specialkey: function(f, e) {
				if (e.getKey() === e.ENTER) {
				    var pf = me.query('textfield[name="password"]')[0];
				    if (pf.getValue()) {
					me.onLogon();
				    } else {
					pf.focus(false);
				    }
				}
			    }
			}
		    },
		    { 
			xtype: 'textfield', 
			inputType: 'password',
			fieldLabel: 'Password', 
			name: 'password',
			blankText: "Enter your password",
			listeners: {
			    specialkey: function(field, e) {
				if (e.getKey() === e.ENTER) {
				    me.onLogon();
				}
			    }
			}
		    },
		    {
			xtype: 'pveRealmComboBox',
			name: 'realm'
		    }
		],
		buttons: [
		    {
			text: 'Login',
			handler: function(){
			    me.onLogon();
			}
		    }
		]
	    }]
	});

	me.callParent();
    }
});
