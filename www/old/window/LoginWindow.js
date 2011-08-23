Ext.ns("PVE.window");

PVE.window.LoginWindow = Ext.extend(Ext.Window, {

    onLogon: function() {
	var self = this;

	var form = self.get(0).getForm();

	if(form.isValid()){
            self.el.mask('Please wait...', 'x-mask-loading');

	    form.submit({
		failure: function(f, resp){
		    self.el.unmask();
		    Ext.MessageBox.alert('Failure', "Login failed. Please try again", function() {
			var uf = form.findField('username');
			uf.focus(true);
		    });
		},
		success: function(f, resp){
		    self.el.unmask();

		    if (resp.result && resp.result.data)
			PVECSRFPreventionToken = resp.result.data.CSRFPreventionToken;

		    var handler = self.handler || Ext.emptyFn;
		    handler.call(self);
		    self.close();
		}
	    });
	}
    },

    initComponent: function() {
	var self = this;

	var realmstore = new Ext.data.JsonStore({
	    url: "/api2/json/access/domains",
	    autoDestory: true,
	    root: 'data',
	    restful: true, // use GET, not POST
	    fields: [ 'realm', 'comment', 'default' ],
	    idProperty: 'realm',
	    sortInfo: { field: 'realm', order: 'DESC' }
	});

	var combo = new Ext.form.ComboBox({
	    fieldLabel: 'Realm',
	    hiddenName: 'realm',
	    store: realmstore,
	    mode: 'local',
	    allowBlank: false,
	    forceSelection: true,
	    autoSelect: false,
	    triggerAction: 'all',
	    valueField: 'realm',
	    displayField: 'comment',
	    getState: function() {
		return { value: this.getValue() };
	    },
	    applyState : function(state) {
		if (state && state.value) {
		    this.setValue(state.value);
		}
	    },
	    stateEvents: [ 'select' ],
	    stateful: true,
	    stateId: 'pveloginrealm'        
	});

	realmstore.load({
	    callback: function(r, o, success) {
		if (success) {
		    var def = combo.getValue();
		    if (!def) {
			if (r[0] && r[0].data)
			    def = r[0].data.realm;
			Ext.each(r, function(record) {
			    if (record.data && record.data["default"]) 
				def = record.data.realm;
			});
		    }
		    if (def)
			combo.setValue(def)
		}
	    }
	});
	

	Ext.apply(self, {
            width: 400,
            height: 160,
            modal: true,
	    border: false,
            draggable: false,
	    closable: false,
	    resizable: false,
	    layout: 'fit',
            title: 'PVE Manager Login',

	    items: [{
		xtype: 'form',
		frame: true,
		url: '/api2/extjs/access/ticket',

		labelWidth: 70,
		labelAlign  : 'right',

		defaults: {
		    anchor: '-5',
		    allowBlank: false
		},

		items: [
		    { 
			xtype: 'textfield', 
			fieldLabel: 'User name', 
			name: 'username',
			blankText:"Enter your user name",
			listeners: {
			    render: function(f) {
				f.focus(true, 500);
			    },
			    specialkey: function(f, e) {
				var form = f.findParentByType("form").getForm();
				if (e.getKey() === e.ENTER) {
				    var pf = form.findField('password');
				    if (pf.getValue()) {
					self.onLogon();
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
			blankText:"Enter your password",
			listeners: {
			    specialkey: function(field, e) {
				if (e.getKey() === e.ENTER) {
				    self.onLogon();
				}
			    }
			}
		    },
		    combo
		],
		buttons: [
		    {
			text: 'Login',
			handler: function(){
			    self.onLogon();
			}
		    }
		]
	    }]
	});

	PVE.window.LoginWindow.superclass.initComponent.call(self);
    }

});
